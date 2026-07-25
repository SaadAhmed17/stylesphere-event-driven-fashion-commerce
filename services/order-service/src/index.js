import express from "express";
import pg from "pg";
import amqp from "amqplib";

const PORT = process.env.PORT || 4006;
const DATABASE_URL = process.env.DATABASE_URL;
const RABBITMQ_URL = process.env.RABBITMQ_URL;

const app = express();
app.use(express.json());

const pool = new pg.Pool({ connectionString: DATABASE_URL });

let channel;

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'confirmed', 'cancelled')),
      total_cents INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS order_items (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders(id),
      sku TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price_cents INTEGER NOT NULL
    );
  `);

  console.log("[order-service] orders and order_items tables ready");
}

async function connectRabbitMQ() {
  const connection = await amqp.connect(RABBITMQ_URL);
  channel = await connection.createChannel();

  await channel.assertExchange("orders_exchange", "topic", { durable: true });

  await channel.assertQueue("order_service_updates", { durable: true });
  await channel.bindQueue("order_service_updates", "orders_exchange", "inventory.failed");
  await channel.bindQueue("order_service_updates", "orders_exchange", "payment.succeeded");
  await channel.bindQueue("order_service_updates", "orders_exchange", "payment.failed");

  channel.consume("order_service_updates", async (msg) => {
    if (!msg) return;

    const event = JSON.parse(msg.content.toString());
    console.log("[order-service] received event:", event.type, event.payload);

    if (event.type === "payment.succeeded") {
      await pool.query(
        "UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2",
        ["confirmed", event.payload.orderId]
      );
      console.log(`[order-service] order ${event.payload.orderId} confirmed`);
    } else if (event.type === "inventory.failed" || event.type === "payment.failed") {
      await pool.query(
        "UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2",
        ["cancelled", event.payload.orderId]
      );
      console.log(`[order-service] order ${event.payload.orderId} cancelled (${event.type})`);
    }

    channel.ack(msg);
  });

  console.log(
    "[order-service] connected to RabbitMQ, listening for inventory.failed, payment.succeeded, payment.failed"
  );
}

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({
      status: "ok",
      service: "order-service",
      database: "connected",
      rabbitmq: channel ? "connected" : "disconnected",
    });
  } catch (err) {
    res.status(503).json({ status: "error", service: "order-service", database: "unreachable" });
  }
});

function publishEvent(type, payload) {
  const message = { type, version: 1, payload };
  channel.publish("orders_exchange", type, Buffer.from(JSON.stringify(message)), {
    persistent: true,
  });
  console.log("[order-service] published event:", type, payload);
}

app.post("/orders", async (req, res) => {
  const { userId, sku, quantity, unitPriceCents } = req.body;

  if (!sku || !quantity || unitPriceCents === undefined) {
    return res.status(400).json({ error: "sku, quantity, and unitPriceCents are required" });
  }
  if (quantity <= 0) {
    return res.status(400).json({ error: "quantity must be greater than zero" });
  }

  const totalCents = quantity * unitPriceCents;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const orderResult = await client.query(
      `INSERT INTO orders (user_id, status, total_cents)
       VALUES ($1, 'pending', $2) RETURNING *`,
      [userId || null, totalCents]
    );
    const order = orderResult.rows[0];

    await client.query(
      `INSERT INTO order_items (order_id, sku, quantity, unit_price_cents)
       VALUES ($1, $2, $3, $4)`,
      [order.id, sku, quantity, unitPriceCents]
    );

    await client.query("COMMIT");

    publishEvent("order.created", { orderId: order.id, productId: sku, quantity });

    res.status(201).json({ orderId: order.id, status: order.status });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[order-service] failed to create order:", err);
    res.status(500).json({ error: "failed to create order" });
  } finally {
    client.release();
  }
});

app.get("/orders", async (req, res) => {
  const result = await pool.query(
    "SELECT * FROM orders ORDER BY created_at DESC LIMIT 50"
  );
  res.json({ orders: result.rows });
});

app.get("/orders/:id", async (req, res) => {
  const orderResult = await pool.query("SELECT * FROM orders WHERE id = $1", [req.params.id]);
  const order = orderResult.rows[0];

  if (!order) {
    return res.status(404).json({ error: "order not found" });
  }

  const itemsResult = await pool.query(
    "SELECT * FROM order_items WHERE order_id = $1",
    [req.params.id]
  );

  res.json({ order: { ...order, items: itemsResult.rows } });
});

async function start() {
  await initDb();
  await connectRabbitMQ();
  app.listen(PORT, () => {
    console.log(`[order-service] listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error("[order-service] failed to start:", err);
  process.exit(1);
});
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

    // Business logic (updating order status) is added in Milestone 5.
    // For now we just acknowledge receipt.

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
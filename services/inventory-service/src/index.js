import express from "express";
import pg from "pg";
import amqp from "amqplib";

const PORT = process.env.PORT || 4005;
const DATABASE_URL = process.env.DATABASE_URL;
const RABBITMQ_URL = process.env.RABBITMQ_URL;

const app = express();
app.use(express.json());

const pool = new pg.Pool({ connectionString: DATABASE_URL });

let channel;

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stock (
      sku TEXT PRIMARY KEY,
      quantity_available INTEGER NOT NULL DEFAULT 0,
      quantity_reserved INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log("[inventory-service] stock table ready");
}

async function connectRabbitMQ() {
  const connection = await amqp.connect(RABBITMQ_URL);
  channel = await connection.createChannel();

  await channel.assertExchange("orders_exchange", "topic", { durable: true });

  console.log("[inventory-service] connected to RabbitMQ, orders_exchange ready");
}

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", service: "inventory-service", database: "connected", rabbitmq: channel ? "connected" : "disconnected", });
  } catch (err) {
    res.status(503).json({ status: "error", service: "inventory-service", database: "unreachable" });
  }
});

app.post("/stock", async (req, res) => {
  const { sku, quantity } = req.body;

  if (!sku || quantity === undefined) {
    return res.status(400).json({ error: "sku and quantity are required" });
  }
  if (quantity < 0) {
    return res.status(400).json({ error: "quantity cannot be negative" });
  }

  const result = await pool.query(
    `INSERT INTO stock (sku, quantity_available)
     VALUES ($1, $2)
     ON CONFLICT (sku)
     DO UPDATE SET quantity_available = $2, updated_at = NOW()
     RETURNING *`,
    [sku, quantity]
  );

  res.status(201).json({ stock: result.rows[0] });
});

app.get("/stock", async (req, res) => {
  const result = await pool.query("SELECT * FROM stock ORDER BY sku");
  res.json({ stock: result.rows });
});

app.get("/stock/:sku", async (req, res) => {
  const result = await pool.query("SELECT * FROM stock WHERE sku = $1", [req.params.sku]);

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "no stock record found for this sku" });
  }

  res.json({ stock: result.rows[0] });
});

async function start() {
  await initDb();
  await connectRabbitMQ();
  app.listen(PORT, () => {
    console.log(`[inventory-service] listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error("[inventory-service] failed to start:", err);
  process.exit(1);
});
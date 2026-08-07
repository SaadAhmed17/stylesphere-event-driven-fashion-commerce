import express from "express";
import pg from "pg";
import amqp from "amqplib";
import jwt from "jsonwebtoken";

const PORT = process.env.PORT || 4007;
const DATABASE_URL = process.env.DATABASE_URL;
const RABBITMQ_URL = process.env.RABBITMQ_URL;
const JWT_SECRET = process.env.JWT_SECRET;

const app = express();
app.use(express.json());

const pool = new pg.Pool({ connectionString: DATABASE_URL });
let channel;

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL,
      method TEXT NOT NULL
        CHECK (method IN ('cod', 'easypaisa', 'jazzcash', 'card')),
      amount_cents INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'charged', 'declined')),
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log("[payment-service] payments table ready");
}

async function connectRabbitMQ() {
  const connection = await amqp.connect(RABBITMQ_URL);
  channel = await connection.createChannel();

  await channel.assertExchange("orders_exchange", "topic", { durable: true });

  await channel.assertQueue("payment_service_reservations", { durable: true });
  await channel.bindQueue("payment_service_reservations", "orders_exchange", "inventory.reserved");

  channel.consume("payment_service_reservations", async (msg) => {
    if (!msg) return;

    const event = JSON.parse(msg.content.toString());
    console.log("[payment-service] received event:", event.type, event.payload);

    if (event.type === "inventory.reserved") {
      await handleReservation(event.payload);
    }
    channel.ack(msg);
  });

  console.log("[payment-service] connected to RabbitMQ, listening for inventory.reserved");
}

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", service: "payment-service", database: "connected", rabbitmq: channel ? "connected" : "disconnected", });
  } catch (err) {
    res.status(503).json({ status: "error", service: "payment-service", database: "unreachable" });
  }
});

function publishEvent(type, payload) {
  const message = { type, version: 1, payload };
  channel.publish("orders_exchange", type, Buffer.from(JSON.stringify(message)), {
    persistent: true,
  });
  console.log("[payment-service] published event:", type, payload);
}

app.get("/payments", authenticate, requireRole("admin", "super_admin"), async (req, res) => {
  const result = await pool.query(
    "SELECT * FROM payments ORDER BY created_at DESC LIMIT 50"
  );
  res.json({ payments: result.rows });
});

app.get("/payments/:orderId", async (req, res) => {
  const result = await pool.query(
    "SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at DESC",
    [req.params.orderId]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "no payment record found for this order" });
  }

  res.json({ payments: result.rows });
});

async function handleReservation({ orderId, productId, quantity }) {
  const declined = quantity >= 5;
  const amountCents = quantity * 4999; // matches the flat test price used throughout this project so far

  await pool.query(
    `INSERT INTO payments (order_id, method, amount_cents, status)
     VALUES ($1, $2, $3, $4)`,
    [orderId, "cod", amountCents, declined ? "declined" : "charged"]
  );

  if (declined) {
    publishEvent("payment.failed", { orderId, productId, quantity, reason: "card_declined" });
  } else {
    publishEvent("payment.succeeded", { orderId, productId, quantity });
  }
}

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "missing or malformed authorization header" });
  }

  const token = authHeader.slice("Bearer ".length);

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "invalid or expired token" });
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "not authenticated" });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "you do not have permission to perform this action" });
    }
    next();
  };
}

async function start() {
  await initDb();
  await connectRabbitMQ();
  app.listen(PORT, () => {
    console.log(`[payment-service] listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error("[payment-service] failed to start:", err);
  process.exit(1);
});
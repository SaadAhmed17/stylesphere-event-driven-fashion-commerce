import express from "express";
import pg from "pg";
import amqp from "amqplib";

const PORT = process.env.PORT || 4007;
const DATABASE_URL = process.env.DATABASE_URL;
const RABBITMQ_URL = process.env.RABBITMQ_URL;

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

// Simulated charge - no real payment gateway yet. quantity >= 5 always
// declines, so both the success and failure paths can be tested on demand.
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
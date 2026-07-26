import express from "express";
import pg from "pg";

const PORT = process.env.PORT || 4007;
const DATABASE_URL = process.env.DATABASE_URL;

const app = express();
app.use(express.json());

const pool = new pg.Pool({ connectionString: DATABASE_URL });

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

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", service: "payment-service", database: "connected" });
  } catch (err) {
    res.status(503).json({ status: "error", service: "payment-service", database: "unreachable" });
  }
});

async function start() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`[payment-service] listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error("[payment-service] failed to start:", err);
  process.exit(1);
});
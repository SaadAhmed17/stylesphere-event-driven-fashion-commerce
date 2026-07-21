import express from "express";
import pg from "pg";

const PORT = process.env.PORT || 4006;
const DATABASE_URL = process.env.DATABASE_URL;

const app = express();
app.use(express.json());

const pool = new pg.Pool({ connectionString: DATABASE_URL });

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

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", service: "order-service", database: "connected" });
  } catch (err) {
    res.status(503).json({ status: "error", service: "order-service", database: "unreachable" });
  }
});

async function start() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`[order-service] listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error("[order-service] failed to start:", err);
  process.exit(1);
});
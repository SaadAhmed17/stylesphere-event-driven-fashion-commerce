import express from "express";
import pg from "pg";

const PORT = process.env.PORT || 4008;
const DATABASE_URL = process.env.DATABASE_URL;

const app = express();
app.use(express.json());

const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cart_items (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      sku TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      added_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (user_id, sku)
    );
  `);
  console.log("[cart-service] cart_items table ready");
}

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", service: "cart-service", database: "connected" });
  } catch (err) {
    res.status(503).json({ status: "error", service: "cart-service", database: "unreachable" });
  }
});

async function start() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`[cart-service] listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error("[cart-service] failed to start:", err);
  process.exit(1);
});
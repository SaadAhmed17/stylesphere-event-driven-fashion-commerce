import express from "express";
import pg from "pg";

const PORT = process.env.PORT || 4009;
const DATABASE_URL = process.env.DATABASE_URL;

const app = express();
app.use(express.json());

const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wishlist_items (
      user_id INTEGER NOT NULL,
      sku TEXT NOT NULL,
      added_at TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (user_id, sku)
    );
  `);
  console.log("[wishlist-service] wishlist_items table ready");
}

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", service: "wishlist-service", database: "connected" });
  } catch (err) {
    res.status(503).json({ status: "error", service: "wishlist-service", database: "unreachable" });
  }
});

async function start() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`[wishlist-service] listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error("[wishlist-service] failed to start:", err);
  process.exit(1);
});
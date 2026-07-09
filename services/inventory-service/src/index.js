import express from "express";
import pg from "pg";

const PORT = process.env.PORT || 4005;
const DATABASE_URL = process.env.DATABASE_URL;

const app = express();
app.use(express.json());

const pool = new pg.Pool({ connectionString: DATABASE_URL });

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

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", service: "inventory-service", database: "connected" });
  } catch (err) {
    res.status(503).json({ status: "error", service: "inventory-service", database: "unreachable" });
  }
});

async function start() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`[inventory-service] listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error("[inventory-service] failed to start:", err);
  process.exit(1);
});
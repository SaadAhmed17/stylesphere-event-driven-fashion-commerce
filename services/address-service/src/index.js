import express from "express";
import pg from "pg";

const PORT = process.env.PORT || 4010;
const DATABASE_URL = process.env.DATABASE_URL;

const app = express();
app.use(express.json());

const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS addresses (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      label TEXT,
      recipient_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      address_line1 TEXT NOT NULL,
      address_line2 TEXT,
      city TEXT NOT NULL,
      province TEXT NOT NULL,
      postal_code TEXT,
      country TEXT NOT NULL DEFAULT 'PK',
      is_default BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // At most one default address per user. Non-default rows are unrestricted.
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS one_default_address_per_user
    ON addresses (user_id) WHERE is_default = true;
  `);

  // Speeds up "all addresses for this user".
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_addresses_user_id
    ON addresses (user_id);
  `);

  console.log("[address-service] addresses table and indexes ready");
}

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", service: "address-service", database: "connected" });
  } catch (err) {
    res.status(503).json({ status: "error", service: "address-service", database: "unreachable" });
  }
});

async function start() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`[address-service] listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error("[address-service] failed to start:", err);
  process.exit(1);
});
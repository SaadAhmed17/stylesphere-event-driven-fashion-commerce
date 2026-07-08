import express from "express";
import pg from "pg";

const PORT = process.env.PORT || 4004;
const DATABASE_URL = process.env.DATABASE_URL;

const app = express();
app.use(express.json());

const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      parent_id INTEGER REFERENCES categories(id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      category_id INTEGER NOT NULL REFERENCES categories(id),
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      description TEXT,
      brand TEXT,
      gender TEXT CHECK (gender IN ('men', 'women', 'kids', 'unisex')),
      base_price_cents INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS product_variants (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id),
      sku TEXT UNIQUE NOT NULL,
      size TEXT,
      color TEXT,
      price_cents INTEGER,
      image_url TEXT
    );
  `);

  console.log("[catalog-service] categories, products, and product_variants tables ready");
}

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", service: "catalog-service", database: "connected" });
  } catch (err) {
    res.status(503).json({ status: "error", service: "catalog-service", database: "unreachable" });
  }
});

async function start() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`[catalog-service] listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error("[catalog-service] failed to start:", err);
  process.exit(1);
});
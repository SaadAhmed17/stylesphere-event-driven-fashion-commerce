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

// ---------- helpers ----------

// Turns a flat list of categories (each with a parent_id) into a nested
// tree structure, e.g. Men -> [ Tops -> [ T-Shirts ] ]
function buildCategoryTree(categories) {
  const byId = new Map();
  categories.forEach((cat) => {
    byId.set(cat.id, { ...cat, children: [] });
  });

  const tree = [];
  categories.forEach((cat) => {
    const node = byId.get(cat.id);
    if (cat.parent_id) {
      const parent = byId.get(cat.parent_id);
      if (parent) {
        parent.children.push(node);
      }
    } else {
      tree.push(node);
    }
  });

  return tree;
}

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// ---------- routes ----------

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", service: "catalog-service", database: "connected" });
  } catch (err) {
    res.status(503).json({ status: "error", service: "catalog-service", database: "unreachable" });
  }
});

app.post("/categories", async (req, res) => {
  const { name, parentId } = req.body;

  if (!name) {
    return res.status(400).json({ error: "name is required" });
  }

  if (parentId) {
    const parentCheck = await pool.query("SELECT id FROM categories WHERE id = $1", [parentId]);
    if (parentCheck.rows.length === 0) {
      return res.status(400).json({ error: "parent category does not exist" });
    }
  }

  const slug = slugify(name);

  const existing = await pool.query("SELECT id FROM categories WHERE slug = $1", [slug]);
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: "a category with this name already exists" });
  }

  const result = await pool.query(
    "INSERT INTO categories (name, slug, parent_id) VALUES ($1, $2, $3) RETURNING *",
    [name, slug, parentId || null]
  );

  res.status(201).json({ category: result.rows[0] });
});

app.get("/categories", async (req, res) => {
  const result = await pool.query("SELECT * FROM categories ORDER BY name");

  if (req.query.flat === "true") {
    return res.json({ categories: result.rows });
  }

  const tree = buildCategoryTree(result.rows);
  res.json({ categories: tree });
});

app.get("/categories/:slug", async (req, res) => {
  const result = await pool.query("SELECT * FROM categories WHERE slug = $1", [req.params.slug]);

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "category not found" });
  }

  res.json({ category: result.rows[0] });
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
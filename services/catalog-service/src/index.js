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

const VALID_GENDERS = ["men", "women", "kids", "unisex"];

// ---------- routes: health ----------

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", service: "catalog-service", database: "connected" });
  } catch (err) {
    res.status(503).json({ status: "error", service: "catalog-service", database: "unreachable" });
  }
});

// ---------- routes: categories ----------

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

// ---------- routes: products ----------

app.post("/products", async (req, res) => {
  const { categoryId, name, description, brand, gender, basePriceCents } = req.body;

  if (!categoryId || !name || basePriceCents === undefined) {
    return res.status(400).json({ error: "categoryId, name, and basePriceCents are required" });
  }

  if (gender && !VALID_GENDERS.includes(gender)) {
    return res.status(400).json({ error: `gender must be one of: ${VALID_GENDERS.join(", ")}` });
  }

  const categoryCheck = await pool.query("SELECT id FROM categories WHERE id = $1", [categoryId]);
  if (categoryCheck.rows.length === 0) {
    return res.status(400).json({ error: "category does not exist" });
  }

  const slug = slugify(name);
  const existing = await pool.query("SELECT id FROM products WHERE slug = $1", [slug]);
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: "a product with this name already exists" });
  }

  const result = await pool.query(
    `INSERT INTO products (category_id, name, slug, description, brand, gender, base_price_cents)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [categoryId, name, slug, description || null, brand || null, gender || null, basePriceCents]
  );

  res.status(201).json({ product: result.rows[0] });
});

app.get("/products/:id", async (req, res) => {
  const productResult = await pool.query("SELECT * FROM products WHERE id = $1", [req.params.id]);
  const product = productResult.rows[0];

  if (!product) {
    return res.status(404).json({ error: "product not found" });
  }

  const variantsResult = await pool.query(
    "SELECT * FROM product_variants WHERE product_id = $1 ORDER BY id",
    [req.params.id]
  );

  res.json({ product: { ...product, variants: variantsResult.rows } });
});

app.get("/products", async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  const sortKey = SORT_OPTIONS[req.query.sort] ? req.query.sort : "newest";
  const orderClause = SORT_OPTIONS[sortKey];

  const { whereClause, values } = buildProductFilters(req.query);

  const countQuery = `
    SELECT COUNT(*) FROM products p
    JOIN categories c ON c.id = p.category_id
    ${whereClause}
  `;
  const countResult = await pool.query(countQuery, values);
  const total = parseInt(countResult.rows[0].count);

  const dataQuery = `
    SELECT p.* FROM products p
    JOIN categories c ON c.id = p.category_id
    ${whereClause}
    ORDER BY ${orderClause}
    LIMIT $${values.length + 1} OFFSET $${values.length + 2}
  `;
  const dataResult = await pool.query(dataQuery, [...values, limit, offset]);

  res.json({
    products: dataResult.rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// ---------- helpers ----------
// (add this alongside buildCategoryTree and slugify)

function buildProductFilters(query) {
  const conditions = [];
  const values = [];

  if (query.category) {
    values.push(query.category);
    conditions.push(`c.slug = $${values.length}`);
  }

  if (query.gender) {
    values.push(query.gender);
    conditions.push(`p.gender = $${values.length}`);
  }

  if (query.minPrice) {
    values.push(Number(query.minPrice));
    conditions.push(`p.base_price_cents >= $${values.length}`);
  }

  if (query.maxPrice) {
    values.push(Number(query.maxPrice));
    conditions.push(`p.base_price_cents <= $${values.length}`);
  }

  if (query.q) {
    values.push(`%${query.q}%`);
    conditions.push(`(p.name ILIKE $${values.length} OR p.description ILIKE $${values.length})`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return { whereClause, values };
}

const SORT_OPTIONS = {
  newest: "p.created_at DESC",
  price_asc: "p.base_price_cents ASC",
  price_desc: "p.base_price_cents DESC",
};

// ---------- routes: variants ----------

app.post("/products/:id/variants", async (req, res) => {
  const productId = req.params.id;
  const { sku, size, color, priceCents, imageUrl } = req.body;

  if (!sku) {
    return res.status(400).json({ error: "sku is required" });
  }

  const productCheck = await pool.query("SELECT id FROM products WHERE id = $1", [productId]);
  if (productCheck.rows.length === 0) {
    return res.status(400).json({ error: "product does not exist" });
  }

  const existing = await pool.query("SELECT id FROM product_variants WHERE sku = $1", [sku]);
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: "a variant with this SKU already exists" });
  }

  const result = await pool.query(
    `INSERT INTO product_variants (product_id, sku, size, color, price_cents, image_url)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [productId, sku, size || null, color || null, priceCents || null, imageUrl || null]
  );

  res.status(201).json({ variant: result.rows[0] });
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
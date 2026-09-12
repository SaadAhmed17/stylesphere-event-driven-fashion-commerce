import express from "express";
import pg from "pg";
import jwt from "jsonwebtoken";

const PORT = process.env.PORT || 4008;
const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET;

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

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "missing or malformed authorization header" });
  }

  const token = authHeader.slice("Bearer ".length);

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "invalid or expired token" });
  }
}

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", service: "cart-service", database: "connected" });
  } catch (err) {
    res.status(503).json({ status: "error", service: "cart-service", database: "unreachable" });
  }
});

app.post("/cart/items", authenticate, async (req, res) => {
  const { sku, quantity } = req.body;
  const userId = req.user.userId;

  if (!sku || !quantity) {
    return res.status(400).json({ error: "sku and quantity are required" });
  }
  if (quantity <= 0) {
    return res.status(400).json({ error: "quantity must be greater than zero" });
  }

  const result = await pool.query(
    `INSERT INTO cart_items (user_id, sku, quantity)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, sku)
     DO UPDATE SET quantity = cart_items.quantity + $3, updated_at = NOW()
     RETURNING *`,
    [userId, sku, quantity]
  );

  res.status(201).json({ item: result.rows[0] });
});

app.get("/cart", authenticate, async (req, res) => {
  const userId = req.user.userId;

  const result = await pool.query(
    "SELECT * FROM cart_items WHERE user_id = $1 ORDER BY added_at",
    [userId]
  );

  res.json({ items: result.rows });
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
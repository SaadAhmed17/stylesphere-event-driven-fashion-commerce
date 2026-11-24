import express from "express";
import pg from "pg";
import jwt from "jsonwebtoken";

const PORT = process.env.PORT || 4009;
const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET;

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
    res.json({ status: "ok", service: "wishlist-service", database: "connected" });
  } catch (err) {
    res.status(503).json({ status: "error", service: "wishlist-service", database: "unreachable" });
  }
});

app.post("/wishlist/items", authenticate, async (req, res) => {
  const { sku } = req.body;
  const userId = req.user.userId;

  if (!sku || typeof sku !== "string") {
    return res.status(400).json({ error: "sku is required and must be a string" });
  }

  const result = await pool.query(
    `INSERT INTO wishlist_items (user_id, sku)
     VALUES ($1, $2)
     ON CONFLICT (user_id, sku) DO NOTHING
     RETURNING *`,
    [userId, sku]
  );

  if (result.rows.length === 0) {
    // Already on the wishlist: same end state, so this is a success, not an error.
    return res.status(200).json({ sku, alreadyInWishlist: true });
  }

  res.status(201).json({ item: result.rows[0], alreadyInWishlist: false });
});

app.get("/wishlist", authenticate, async (req, res) => {
  const userId = req.user.userId;

  const result = await pool.query(
    "SELECT sku, added_at FROM wishlist_items WHERE user_id = $1 ORDER BY added_at DESC",
    [userId]
  );

  res.json({ items: result.rows });
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
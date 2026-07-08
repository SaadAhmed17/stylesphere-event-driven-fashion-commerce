import express from "express";
import pg from "pg";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const PORT = process.env.PORT || 4003;
const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET;

const app = express();
app.use(express.json());

const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'customer'
        CHECK (role IN ('customer', 'admin', 'super_admin')),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log("[auth-service] users table ready");
}

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", service: "auth-service", database: "connected" });
  } catch (err) {
    res.status(503).json({ status: "error", service: "auth-service", database: "unreachable" });
  }
});

app.post("/signup", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "password must be at least 6 characters" });
  }

  const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: "an account with this email already exists" });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const result = await pool.query(
    "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, role, created_at",
    [email, passwordHash]
  );

  res.status(201).json({ user: result.rows[0] });
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required" });
  }

  const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
  const user = result.rows[0];

  // Deliberately the same error for "no such user" and "wrong password" -
  // see explanation below this code block for why that matters.
  if (!user) {
    return res.status(401).json({ error: "invalid email or password" });
  }

  const passwordMatches = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatches) {
    return res.status(401).json({ error: "invalid email or password" });
  }

  const accessToken = jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: "15m" }
  );

  res.json({
    accessToken,
    user: { id: user.id, email: user.email, role: user.role },
  });
});

async function start() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`[auth-service] listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error("[auth-service] failed to start:", err);
  process.exit(1);
});
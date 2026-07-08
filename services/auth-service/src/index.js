import express from "express";
import pg from "pg";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";

const PORT = process.env.PORT || 4003;
const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET;
const REFRESH_TOKEN_TTL_DAYS = 7;

// ... app, pool, initDb, /health, /signup, /login all stay exactly as before ...

function generateRefreshToken() {
  return crypto.randomBytes(40).toString("hex");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function issueRefreshToken(userId) {
  const rawToken = generateRefreshToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  await pool.query(
    "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
    [userId, tokenHash, expiresAt]
  );

  return rawToken;
}

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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      revoked_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  console.log("[auth-service] users and refresh_tokens tables ready");
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

    const refreshToken = await issueRefreshToken(user.id);

  res.json({
    accessToken,
    refreshToken,
    user: { id: user.id, email: user.email, role: user.role },
  });
});

app.post("/refresh", async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ error: "refreshToken is required" });
  }

  const tokenHash = hashToken(refreshToken);
  const result = await pool.query(
    "SELECT * FROM refresh_tokens WHERE token_hash = $1",
    [tokenHash]
  );
  const stored = result.rows[0];

  if (!stored || stored.revoked_at || new Date(stored.expires_at) < new Date()) {
    return res.status(401).json({ error: "invalid or expired refresh token" });
  }

  // Rotation: revoke the one just used, issue a brand new one
  await pool.query("UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1", [stored.id]);
  const newRefreshToken = await issueRefreshToken(stored.user_id);

  const userResult = await pool.query("SELECT * FROM users WHERE id = $1", [stored.user_id]);
  const user = userResult.rows[0];

  const accessToken = jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: "15m" }
  );

  res.json({ accessToken, refreshToken: newRefreshToken });
});

app.post("/logout", async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ error: "refreshToken is required" });
  }

  const tokenHash = hashToken(refreshToken);
  await pool.query(
    "UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL",
    [tokenHash]
  );

  res.json({ message: "logged out" });
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
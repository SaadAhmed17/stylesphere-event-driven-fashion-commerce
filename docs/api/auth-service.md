# Auth Service — API Documentation

Base URL (local development): `http://localhost:4003`

Auth Service handles user registration, login, session management (via
refresh tokens), and issues the JWTs that every other service will
eventually use to verify identity and role. See
[ADR 0004](../../adr/0004-jwt-based-authentication.md) for the reasoning
behind this design.

## Authentication

Endpoints marked **🔒 Requires token** expect an `Authorization` header:
```
Authorization: Bearer <accessToken>
```

---

## `GET /health`

Checks whether the service and its database connection are alive.

**Response `200`:**
```json
{ "status": "ok", "service": "auth-service", "database": "connected" }
```

**Response `503`** (database unreachable):
```json
{ "status": "error", "service": "auth-service", "database": "unreachable" }
```

---

## `POST /signup`

Creates a new user account with role `customer` (the only role available
through public signup — `admin`/`super_admin` are assigned manually, not
self-selected).

**Request body:**
```json
{ "email": "you@example.com", "password": "password123" }
```

| Field | Type | Rules |
|---|---|---|
| `email` | string | required, must be unique |
| `password` | string | required, minimum 6 characters |

**Response `201`:**
```json
{ "user": { "id": 1, "email": "you@example.com", "role": "customer", "created_at": "..." } }
```

**Errors:**
| Status | Body | Cause |
|---|---|---|
| `400` | `{ "error": "email and password are required" }` | missing field |
| `400` | `{ "error": "password must be at least 6 characters" }` | password too short |
| `409` | `{ "error": "an account with this email already exists" }` | duplicate email |

---

## `POST /login`

Verifies credentials and issues a new access token + refresh token pair.

**Request body:**
```json
{ "email": "you@example.com", "password": "password123" }
```

**Response `200`:**
```json
{
  "accessToken": "eyJhbGc...",
  "refreshToken": "fac9001e...",
  "user": { "id": 1, "email": "you@example.com", "role": "customer" }
}
```

- `accessToken` expires in **15 minutes** — see
  [ADR 0004](../../adr/0004-jwt-based-authentication.md) for why it's short-lived
- `refreshToken` expires in **7 days**, and is single-use (rotated on every use — see `/refresh` below)

**Errors:**
| Status | Body | Cause |
|---|---|---|
| `400` | `{ "error": "email and password are required" }` | missing field |
| `401` | `{ "error": "invalid email or password" }` | wrong email *or* wrong password (deliberately identical message — prevents attackers from discovering which emails are registered) |

---

## `POST /refresh`

Exchanges a valid, unused refresh token for a new access token **and** a new
refresh token. The refresh token used in this request is immediately
revoked (rotation) — see
[ADR 0004](../../adr/0004-jwt-based-authentication.md) for why.

**Request body:**
```json
{ "refreshToken": "fac9001e..." }
```

**Response `200`:**
```json
{ "accessToken": "eyJhbGc...", "refreshToken": "a1b2c3..." }
```

**Errors:**
| Status | Body | Cause |
|---|---|---|
| `400` | `{ "error": "refreshToken is required" }` | missing field |
| `401` | `{ "error": "invalid or expired refresh token" }` | token doesn't exist, already used, or past its 7-day expiry |

---

## `POST /logout`

Revokes a specific refresh token, ending that session. Does not affect
other active sessions/devices for the same user.

**Request body:**
```json
{ "refreshToken": "fac9001e..." }
```

**Response `200`:**
```json
{ "message": "logged out" }
```

Always returns `200` even if the token was already invalid — logout is
designed to always feel successful from the client's perspective.

---

## `GET /me` 🔒 Requires token

Returns the profile of whoever the access token belongs to.

**Response `200`:**
```json
{ "user": { "id": 1, "email": "you@example.com", "role": "admin", "created_at": "..." } }
```

**Errors:**
| Status | Body | Cause |
|---|---|---|
| `401` | `{ "error": "missing or malformed authorization header" }` | no `Authorization` header, or doesn't start with `Bearer ` |
| `401` | `{ "error": "invalid or expired token" }` | signature invalid or token expired |

---

## `GET /admin/users` 🔒 Requires token, role: `admin` or `super_admin`

Lists all registered users. Demonstrates the `requireRole()` middleware —
see [system-overview.md](../architecture/system-overview.md) for how this
pattern is expected to repeat across future services.

**Response `200`:**
```json
{ "users": [ { "id": 1, "email": "you@example.com", "role": "admin", "created_at": "..." } ] }
```

**Errors:**
| Status | Body | Cause |
|---|---|---|
| `401` | *(same as `/me`)* | not authenticated at all |
| `403` | `{ "error": "you do not have permission to perform this action" }` | authenticated, but role isn't `admin`/`super_admin` |

---

## Known limitations (deliberate scope cuts for the MVP)

- No email verification or forgot-password flow yet — planned for Expansion
- No rate limiting on `/login` yet (brute-force protection) — planned for the security hardening phase
- Refresh tokens are sent in the request body, not an httpOnly cookie — a real security improvement to make when the frontend's login flow is built
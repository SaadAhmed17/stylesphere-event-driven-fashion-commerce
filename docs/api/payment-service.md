# Payment Service — API Documentation

Base URL (local development): `http://localhost:4007`

Payment Service reacts to `inventory.reserved`, simulates charging a
customer, and publishes `payment.succeeded` or `payment.failed`. This
closes the MVP checkout loop — see
[sequence-checkout-flow.md](../architecture/sequence-checkout-flow.md) for
the full picture.

## Authentication

`GET /payments` (the full list) requires a valid access token with role
`admin` or `super_admin`:
```
Authorization: Bearer <accessToken>
```
`GET /payments/:orderId` is currently public — see limitations below.

---

## `GET /health` 🌐 Public

**Response `200`:**
```json
{ "status": "ok", "service": "payment-service", "database": "connected", "rabbitmq": "connected" }
```

---

## `GET /payments` 🔒 Requires token, role: `admin` or `super_admin`

Returns the 50 most recent payment records across all orders.

**Response `200`:**
```json
{ "payments": [ { "id": 2, "order_id": 9, "method": "cod", "amount_cents": 24995, "status": "declined", "created_at": "..." } ] }
```

**Errors:** `401` (no/invalid token), `403` (authenticated but wrong role).

---

## `GET /payments/:orderId` 🌐 Public *(see limitations)*

Returns all payment attempts recorded for a given order (usually one, but
the shape supports multiple attempts — e.g. a retried payment).

**Response `200`:**
```json
{ "payments": [ { "id": 1, "order_id": 8, "method": "cod", "amount_cents": 9998, "status": "charged", "created_at": "..." } ] }
```

**Errors:** `404` if no payment record exists for that order.

---

## Event-driven behavior (not callable directly)

| Event consumed | What this service does | Event(s) published |
|---|---|---|
| `inventory.reserved` | Simulates a charge. Quantity >= 5 always declines (a deliberate, controllable test trigger — not a real fraud/limit check). Records the attempt in `payments`. | `payment.succeeded` or `payment.failed` |

Queue name: `payment_service_reservations` (bound to `inventory.reserved` on
`orders_exchange`).

## Known limitations (deliberate scope cuts for the MVP)

- **No real payment gateway integration** — charges are simulated. The
  `method`/`amount_cents`/`status` schema is designed to support real
  EasyPaisa/JazzCash/card/Stripe integration later without changing Order
  Service, per the original project goals — but the actual gateway calls
  are not implemented.
- **`method` always defaults to `cod`** — no payment method selection exists
  yet in the checkout flow (Order Service doesn't collect or forward one).
- **`amount_cents` is calculated from a hardcoded test price**, not looked
  up from Catalog Service — same category of shortcut as Order Service
  trusting a client-supplied price (see
  [order-service.md limitations](./order-service.md#known-limitations-deliberate-scope-cuts-for-the-mvp)).
- **`GET /payments/:orderId` is public** — in a real system, only the
  order's owner or an admin should see this. Deferred alongside the
  identical, already-documented gap in Order Service's `userId` handling.
- No idempotency protection, same category of gap as Inventory Service and
  Order Service.
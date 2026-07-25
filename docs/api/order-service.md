# Order Service — API Documentation

Base URL (local development): `http://localhost:4006`

Order Service creates orders and orchestrates the checkout flow's outcome —
it's the only service that both publishes and consumes events in this
system. See [event-catalog.md](../events/event-catalog.md) for full event
payloads and [sequence-checkout-flow.md](../architecture/sequence-checkout-flow.md)
for how this fits into the complete checkout story.

## Authentication

None of this service's endpoints currently require a token. `POST /orders`
accepts an optional `userId` for logged-in customers, but does **not**
verify it against a real token yet — a known, deliberate MVP limitation
(see below).

---

## `GET /health` 🌐 Public

**Response `200`:**
```json
{ "status": "ok", "service": "order-service", "database": "connected", "rabbitmq": "connected" }
```

---

## `POST /orders` 🌐 Public

Creates an order and publishes `order.created`. Supports guest checkout
(`userId` omitted).

**Request body:**
```json
{ "userId": null, "sku": "hoodie-m-black", "quantity": 2, "unitPriceCents": 4999 }
```

| Field | Type | Rules |
|---|---|---|
| `userId` | integer | optional — not verified against a token, see limitations below |
| `sku` | string | required |
| `quantity` | integer | required, must be > 0 |
| `unitPriceCents` | integer | required — trusted from the client for the MVP, see limitations below |

**Response `201`:**
```json
{ "orderId": 3, "status": "pending" }
```

Order starts as `pending` and transitions asynchronously to `confirmed` or
`cancelled` as outcome events arrive — the response does **not** wait for
that to happen.

**Errors:**
| Status | Body | Cause |
|---|---|---|
| `400` | `{ "error": "sku, quantity, and unitPriceCents are required" }` | missing field |
| `400` | `{ "error": "quantity must be greater than zero" }` | invalid quantity |
| `500` | `{ "error": "failed to create order" }` | database error during order creation |

---

## `GET /orders` 🌐 Public

Returns the 50 most recent orders, without item details.

**Response `200`:**
```json
{ "orders": [ { "id": 3, "user_id": null, "status": "confirmed", "total_cents": 9998, "created_at": "...", "updated_at": "..." } ] }
```

---

## `GET /orders/:id` 🌐 Public

Returns one order with its line items.

**Response `200`:**
```json
{
  "order": {
    "id": 3,
    "status": "confirmed",
    "total_cents": 9998,
    "items": [ { "sku": "hoodie-m-black", "quantity": 2, "unit_price_cents": 4999 } ]
  }
}
```

**Errors:** `404` if the order doesn't exist.

---

## Event-driven behavior (not callable directly)

| Event | Direction | Effect |
|---|---|---|
| `order.created` | Published | Fired immediately after an order is saved as `pending` |
| `inventory.failed` | Consumed | Order status set to `cancelled` |
| `payment.succeeded` | Consumed | Order status set to `confirmed` |
| `payment.failed` | Consumed | Order status set to `cancelled` |

Queue name: `order_service_updates` (bound to `inventory.failed`,
`payment.succeeded`, and `payment.failed` on `orders_exchange`).

## Known limitations (deliberate scope cuts for the MVP)

- `userId` in the request body is trusted as-is, not verified against a JWT
  — a real implementation would only trust `userId` extracted from a valid
  token, and allow `userId: null` only when no token is present at all
- `unitPriceCents` is trusted from the client, not looked up from Catalog
  Service — a real implementation must never trust a client-supplied price
- Only one product per order is supported, matching the MVP event catalog —
  see the note at the top of Phase 5 in project history for why, and how
  the schema is already shaped to support multi-item orders later
- No idempotency protection on the outcome-event consumer, same category of
  gap as Inventory Service (see its documented limitations)
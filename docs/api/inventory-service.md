# Inventory Service — API Documentation

Base URL (local development): `http://localhost:4005`

Inventory Service tracks available and reserved stock per SKU. It exposes a
small HTTP API for manual stock management, but its core behavior happens
asynchronously — reacting to events on RabbitMQ rather than being called
directly. See [event-catalog.md](../events/event-catalog.md) for the events
this service publishes and consumes, and
[system-overview.md](../architecture/system-overview.md) for how it fits
into the full checkout flow.

## Authentication

`POST /stock` requires a valid access token with role `admin` or
`super_admin`:
```
Authorization: Bearer <accessToken>
```
Both `GET` endpoints are public.

---

## `GET /health` 🌐 Public

**Response `200`:**
```json
{ "status": "ok", "service": "inventory-service", "database": "connected", "rabbitmq": "connected" }
```

Note `rabbitmq` reflects whether the service successfully connected and
declared its exchange/queue on startup — not a live ping on every request.

---

## `POST /stock` 🔒 Requires token, role: `admin` or `super_admin`

Sets the available quantity for a SKU. Behaves as an **upsert** — creates a
new stock record if the SKU has never been tracked, or overwrites the
existing `quantity_available` if it has. This sets an absolute count, not an
increment.

**Request body:**
```json
{ "sku": "hoodie-m-black", "quantity": 35 }
```

| Field | Type | Rules |
|---|---|---|
| `sku` | string | required — should match a real SKU from Catalog Service, though this isn't enforced at the database level (see [ADR 0003](../../adr/0003-database-per-service.md)) |
| `quantity` | integer | required, must be >= 0 |

**Response `201`:**
```json
{ "stock": { "sku": "hoodie-m-black", "quantity_available": 35, "quantity_reserved": 2, "updated_at": "..." } }
```

**Errors:**
| Status | Body | Cause |
|---|---|---|
| `400` | `{ "error": "sku and quantity are required" }` | missing field |
| `400` | `{ "error": "quantity cannot be negative" }` | negative quantity |

---

## `GET /stock` 🌐 Public

**Response `200`:**
```json
{ "stock": [ { "sku": "hoodie-m-black", "quantity_available": 33, "quantity_reserved": 2, "updated_at": "..." } ] }
```

---

## `GET /stock/:sku` 🌐 Public

**Response `200`:**
```json
{ "stock": { "sku": "hoodie-m-black", "quantity_available": 33, "quantity_reserved": 2, "updated_at": "..." } }
```

**Errors:** `404` if no stock record exists for that SKU.

---

## Event-driven behavior (not callable directly)

This service also reacts to RabbitMQ events. These are **not** HTTP
endpoints — they happen automatically when the corresponding event is
published to `orders_exchange`. Full payload definitions live in
[event-catalog.md](../events/event-catalog.md); this table just summarizes
the behavior.

| Event consumed | What this service does | Event(s) published in response |
|---|---|---|
| `order.created` | Locks the stock row, checks if `quantity_available >= quantity`. If yes, moves units from available to reserved. | `inventory.reserved` (success) or `inventory.failed` (insufficient stock) |
| `payment.failed` | Moves the previously reserved units back to available. | *(none — this is the end of the rollback path)* |

Queue name: `inventory_service_orders` (bound to both `order.created` and
`payment.failed` on `orders_exchange`).

## Known limitations (deliberate scope cuts for the MVP)

- No idempotency protection — if a message were somehow redelivered (a real
  possibility with message queues), `order.created` could double-reserve or
  `payment.failed` could double-release. A production system would track
  processed event IDs to guard against this. Flagged here honestly as a real
  gap, not an oversight — see the [Phase 1 sequence diagram notes](../architecture/sequence-checkout-flow.md#what-this-diagram-deliberately-leaves-out).
- `POST /stock` sets an absolute quantity, not an incremental "add N units" —
  a reasonable future addition once a real warehouse/restocking workflow is needed.
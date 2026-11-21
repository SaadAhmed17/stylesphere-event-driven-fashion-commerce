# Cart Service — API Documentation

Base URL (local development): `http://localhost:4008`

Cart Service stores each customer's pre-checkout shopping cart. It is the
first service in this project that neither publishes nor consumes any
RabbitMQ events: adding an item to a cart has no effect on any other
service, so plain request/response CRUD is the right design here. See
[ADR 0002](../../adr/0002-use-event-driven-communication-with-rabbitmq.md)
for where events *are* used.

## Authentication

**Every endpoint requires a valid access token** from Auth Service:
```
Authorization: Bearer <accessToken>
```
There are no public routes. The user a cart belongs to always comes from
the verified token (`userId`), never from the request body or URL, so a
customer can only ever read or modify their own cart.

---

## `GET /health` 🌐 Public

**Response `200`:**
```json
{ "status": "ok", "service": "cart-service", "database": "connected" }
```

---

## `POST /cart/items` 🔒 Requires token

Adds an item to the caller's cart. If the SKU is already in the cart, the
quantity is **added** to the existing quantity (relative change).

**Request body:**
```json
{ "sku": "hoodie-m-black", "quantity": 1 }
```

| Field | Type | Rules |
|---|---|---|
| `sku` | string | required |
| `quantity` | integer | required, whole number > 0 |

**Response `201`:**
```json
{ "item": { "id": 1, "user_id": 2, "sku": "hoodie-m-black", "quantity": 2, "added_at": "...", "updated_at": "..." } }
```

**Errors:**
| Status | Body | Cause |
|---|---|---|
| `400` | `{ "error": "sku and quantity are required" }` | missing field |
| `400` | `{ "error": "quantity must be a whole number greater than zero" }` | zero, negative, or non-integer quantity |
| `401` | `{ "error": "missing or malformed authorization header" }` / `{ "error": "invalid or expired token" }` | no or bad token |

---

## `GET /cart` 🔒 Requires token

Returns all items in the caller's cart, oldest first.

**Response `200`:**
```json
{ "items": [ { "id": 1, "user_id": 2, "sku": "hoodie-m-black", "quantity": 2, "added_at": "...", "updated_at": "..." } ] }
```
An empty cart returns `{ "items": [] }`.

---

## `PUT /cart/items/:sku` 🔒 Requires token

Sets an item's quantity to an **exact** value (absolute change), as opposed
to `POST`, which adds to it.

**Request body:**
```json
{ "quantity": 5 }
```

**Response `200`:** `{ "item": { ... } }`

**Errors:**
| Status | Body | Cause |
|---|---|---|
| `400` | `{ "error": "quantity is required" }` | missing field |
| `400` | `{ "error": "quantity must be a whole number greater than zero (use DELETE to remove an item)" }` | zero, negative, or non-integer |
| `404` | `{ "error": "item not found in your cart" }` | SKU isn't in the caller's cart |

---

## `DELETE /cart/items/:sku` 🔒 Requires token

Removes one item from the caller's cart.

**Response `200`:** `{ "message": "item removed", "sku": "hoodie-m-black" }`

**Errors:** `404` if the SKU isn't in the caller's cart.

---

## `DELETE /cart` 🔒 Requires token

Removes every item from the caller's cart. Returns `200` even if the cart
was already empty.

**Response `200`:** `{ "message": "cart cleared", "removedItems": 2 }`

---

## Data model

`cart_items` — one row per (user, SKU). The pair `(user_id, sku)` is unique,
and `quantity` has a database-level `CHECK (quantity > 0)`. `user_id` and
`sku` are references by value to Auth Service and Catalog Service
respectively, per [ADR 0003](../../adr/0003-database-per-service.md).

## Known limitations (deliberate scope cuts)

- **No checkout integration.** A cart can hold several different SKUs, but
  Order Service currently accepts exactly one SKU per order (see
  [order-service.md](./order-service.md)). Checking out a cart requires a
  `v2` of `order.created` and changes to Order, Inventory, and Payment
  Services, which is its own piece of work.
- **SKUs aren't validated against Catalog Service.** Any string is accepted
  as a SKU, so a cart can contain items that don't exist.
- **No stock check.** Adding an item doesn't verify that stock is available.
  That is only checked when an order is placed.
- **No prices stored or returned.** The cart holds only SKU and quantity;
  prices must be fetched from Catalog Service by whoever displays the cart.
- **No cart expiry.** Abandoned carts persist indefinitely.
# Wishlist Service — API Documentation

Base URL (local development): `http://localhost:4009`

Wishlist Service stores each customer's saved SKUs. Like
[Cart Service](./cart-service.md), it neither publishes nor consumes
RabbitMQ events. See [ADR 0005](../../adr/0005-events-for-cross-service-workflows-only.md)
for why.

A wishlist is a **set**: an item is either on it or not. There are no
quantities, and adding an item that is already there is a no-op rather than
an error.

## Authentication

**Every endpoint requires a valid access token** from Auth Service:
```
Authorization: Bearer <accessToken>
```
The user a wishlist belongs to always comes from the verified token, never
from the request body or URL, and every query is scoped to that user. A
customer can only read or modify their own wishlist.

---

## `GET /health` 🌐 Public

**Response `200`:**
```json
{ "status": "ok", "service": "wishlist-service", "database": "connected" }
```

---

## `POST /wishlist/items` 🔒 Requires token

Adds a SKU to the caller's wishlist. **Idempotent**: adding a SKU that is
already on the list succeeds and changes nothing.

**Request body:**
```json
{ "sku": "hoodie-m-black" }
```

| Field | Type | Rules |
|---|---|---|
| `sku` | string | required, must be a string |

**Response `201`** (newly added):
```json
{ "item": { "user_id": 2, "sku": "hoodie-m-black", "added_at": "..." }, "alreadyInWishlist": false }
```

**Response `200`** (already on the list):
```json
{ "sku": "hoodie-m-black", "alreadyInWishlist": true }
```

**Errors:**
| Status | Body | Cause |
|---|---|---|
| `400` | `{ "error": "sku is required and must be a string" }` | missing or non-string SKU |
| `401` | `{ "error": "missing or malformed authorization header" }` / `{ "error": "invalid or expired token" }` | no or bad token |

---

## `GET /wishlist` 🔒 Requires token

Returns the caller's wishlist, **newest first**.

**Response `200`:**
```json
{ "items": [ { "sku": "hoodie-l-black", "added_at": "..." }, { "sku": "hoodie-m-black", "added_at": "..." } ] }
```
An empty wishlist returns `{ "items": [] }`.

---

## `GET /wishlist/items/:sku` 🔒 Requires token

Answers "is this SKU on my wishlist?" Always returns `200`, because "no" is
a valid answer, not a missing resource. Intended for a single product page
deciding whether to show a filled or empty heart. A product *grid* should
fetch `GET /wishlist` once and compare locally instead of calling this once
per product.

**Response `200`:**
```json
{ "sku": "hoodie-m-black", "inWishlist": true }
```

---

## `DELETE /wishlist/items/:sku` 🔒 Requires token

Removes a SKU from the caller's wishlist. **Idempotent**: removing a SKU
that isn't on the list still returns `200`, with `removed: false`.

**Response `200`:**
```json
{ "sku": "hoodie-m-black", "removed": true }
```

Note the contrast with Cart Service, where removing an item that isn't in
the cart returns `404`. A cart removal usually signals a stale view of
something the customer is about to buy, so the error is useful. A wishlist
removal is typically a heart-icon toggle, where double-clicks and multiple
open tabs are normal and the customer's intent is already satisfied.

---

## `DELETE /wishlist` 🔒 Requires token

Removes every item from the caller's wishlist. Returns `200` even if it was
already empty.

**Response `200`:**
```json
{ "message": "wishlist cleared", "removedItems": 2 }
```

---

## Data model

`wishlist_items` has a composite primary key `(user_id, sku)` and an
`added_at` timestamp. There is no surrogate `id`, because nothing addresses
a wishlist row by number, and no `updated_at`, because rows are never
modified. The key column order (`user_id` first) lets Postgres use the
primary key index for "all items for this user" queries. `user_id` and `sku`
are references by value to Auth Service and Catalog Service, per
[ADR 0003](../../adr/0003-database-per-service.md).

## Moving an item from the wishlist to the cart

There is deliberately **no "move to cart" endpoint** in either service. A
client performs two calls: `POST /cart/items` on Cart Service, then
`DELETE /wishlist/items/:sku` on Wishlist Service. Each service stays
unaware of the other.

The trade-off is that the two calls aren't atomic. If the first succeeds and
the second fails, the item is briefly in both places, which is harmless and
easy for the client to retry. See ADR 0005 for the full reasoning.

## Known limitations (deliberate scope cuts)

- **SKUs aren't validated against Catalog Service.** Any string is
  accepted, so a wishlist can contain items that don't exist.
- **No notifications.** Price-drop and back-in-stock alerts would need
  Notification Service plus events from Catalog and Inventory, and belong
  to a later phase.
- **No limit on wishlist size.**
- **No wishlist sharing or multiple named lists.**
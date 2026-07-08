# Catalog Service — API Documentation

Base URL (local development): `http://localhost:4004`

Catalog Service manages categories, products, and product variants (the
size/color/SKU combinations customers actually purchase). See
[schema-overview.md](../database/schema-overview.md) for the underlying data
model and [ADR 0003](../../adr/0003-database-per-service.md) for why this
service owns its data independently.

## Authentication

Write endpoints (creating categories, products, variants) require a valid
access token from **Auth Service** with role `admin` or `super_admin`:
```
Authorization: Bearer <accessToken>
```
Browsing endpoints (everything marked 🌐 Public below) require no token at
all — anyone can view the catalog.

Catalog Service does **not** have its own login system or user table — it
independently verifies tokens issued by Auth Service using a shared
`JWT_SECRET`, per [ADR 0004](../../adr/0004-jwt-based-authentication.md).

---

## `GET /health` 🌐 Public

**Response `200`:**
```json
{ "status": "ok", "service": "catalog-service", "database": "connected" }
```

---

## `POST /categories` 🔒 Requires token, role: `admin` or `super_admin`

Creates a category. Can be top-level or nested under an existing category.

**Request body:**
```json
{ "name": "Tops", "parentId": 1 }
```

| Field | Type | Rules |
|---|---|---|
| `name` | string | required |
| `parentId` | integer | optional — must reference an existing category |

**Response `201`:**
```json
{ "category": { "id": 2, "name": "Tops", "slug": "tops", "parent_id": 1 } }
```

**Errors:**
| Status | Body | Cause |
|---|---|---|
| `400` | `{ "error": "name is required" }` | missing field |
| `400` | `{ "error": "parent category does not exist" }` | invalid `parentId` |
| `409` | `{ "error": "a category with this name already exists" }` | duplicate slug |

---

## `GET /categories` 🌐 Public

Returns categories as a nested tree by default.

**Query params:** `?flat=true` — returns a flat list instead of a tree.

**Response `200`** (nested):
```json
{ "categories": [ { "id": 1, "name": "Men", "slug": "men", "parent_id": null, "children": [ ] } ] }
```

---

## `GET /categories/:slug` 🌐 Public

**Response `200`:**
```json
{ "category": { "id": 2, "name": "Tops", "slug": "tops", "parent_id": 1 } }
```

**Errors:** `404` if the slug doesn't match any category.

---

## `POST /products` 🔒 Requires token, role: `admin` or `super_admin`

**Request body:**
```json
{
  "categoryId": 3,
  "name": "Classic Fleece Hoodie",
  "description": "A soft, everyday fleece hoodie.",
  "brand": "StyleSphere",
  "gender": "unisex",
  "basePriceCents": 4999
}
```

| Field | Type | Rules |
|---|---|---|
| `categoryId` | integer | required, must exist |
| `name` | string | required |
| `basePriceCents` | integer | required, price in cents (never a decimal — see [ADR context in schema-overview.md](../database/schema-overview.md)) |
| `description` | string | optional |
| `brand` | string | optional |
| `gender` | string | optional — one of `men`, `women`, `kids`, `unisex` |

**Response `201`:** the created product.

**Errors:**
| Status | Body | Cause |
|---|---|---|
| `400` | `{ "error": "categoryId, name, and basePriceCents are required" }` | missing field |
| `400` | `{ "error": "gender must be one of: men, women, kids, unisex" }` | invalid gender |
| `400` | `{ "error": "category does not exist" }` | invalid `categoryId` |
| `409` | `{ "error": "a product with this name already exists" }` | duplicate slug |

---

## `GET /products` 🌐 Public

Search, filter, sort, and paginate the catalog.

**Query params:**
| Param | Type | Description |
|---|---|---|
| `q` | string | text search across name and description |
| `category` | string | filter by category slug |
| `gender` | string | filter by gender |
| `minPrice` / `maxPrice` | integer | price range, in cents |
| `sort` | string | `newest` (default), `price_asc`, `price_desc` |
| `page` | integer | default `1` |
| `limit` | integer | default `20`, max `50` |

**Response `200`:**
```json
{
  "products": [ { "id": 1, "name": "Classic Fleece Hoodie", "...": "..." } ],
  "pagination": { "page": 1, "limit": 20, "total": 2, "totalPages": 1 }
}
```

---

## `GET /products/:id` 🌐 Public

Returns one product with its variants nested inside.

**Response `200`:**
```json
{
  "product": {
    "id": 1,
    "name": "Classic Fleece Hoodie",
    "variants": [
      { "id": 1, "sku": "hoodie-m-black", "size": "M", "color": "black", "price_cents": 4999 }
    ]
  }
}
```

**Errors:** `404` if the product doesn't exist.

---

## `POST /products/:id/variants` 🔒 Requires token, role: `admin` or `super_admin`

**Request body:**
```json
{ "sku": "hoodie-m-black", "size": "M", "color": "black", "priceCents": 4999, "imageUrl": null }
```

| Field | Type | Rules |
|---|---|---|
| `sku` | string | required, must be unique across the entire catalog |
| `size` | string | optional |
| `color` | string | optional |
| `priceCents` | integer | optional — falls back to the product's `basePriceCents` if omitted |
| `imageUrl` | string | optional |

**Response `201`:** the created variant.

**Errors:**
| Status | Body | Cause |
|---|---|---|
| `400` | `{ "error": "sku is required" }` | missing field |
| `400` | `{ "error": "product does not exist" }` | invalid product `id` in the URL |
| `409` | `{ "error": "a variant with this SKU already exists" }` | duplicate SKU |

---

## Known limitations (deliberate scope cuts for the MVP)

- No update or delete endpoints yet for categories/products/variants — only create and read. Editing is planned once the Admin Dashboard (Expansion phase) needs it.
- No image upload — `imageUrl` is just a plain string field for now, assumed to point somewhere external.
- `sku` is the field every other service (Inventory, Order, Payment) will reference by value — see [event-catalog.md](../events/event-catalog.md) and [ADR 0003](../../adr/0003-database-per-service.md) for why there's no database-enforced link across services.
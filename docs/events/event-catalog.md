# Event Catalog — MVP Loop

This document is the single source of truth for every event in the MVP
checkout flow. Any service publishing or consuming one of these events must
match the shape defined here exactly. If a service needs a field that isn't
listed, that's a sign the event needs a deliberate version bump — not an
undocumented field added quietly.

All events are published to a single topic exchange: **`orders_exchange`**.
The event `type` doubles as the RabbitMQ routing key (e.g. `order.created`).

## Event envelope

Every event, regardless of type, is wrapped the same way:

```json
{
  "type": "order.created",
  "version": 1,
  "payload": { }
}
```

| Field | Type | Description |
|---|---|---|
| `type` | string | The event name, also used as the routing key |
| `version` | integer | Schema version of this event's payload |
| `payload` | object | The event-specific data — see each event below |

---

## `order.created`

**Published by:** Order Service
**Consumed by:** Inventory Service

Fired the moment a customer places an order, before we know if stock or
payment will succeed.

```json
{
  "type": "order.created",
  "version": 1,
  "payload": {
    "orderId": 101,
    "productId": "sku-001",
    "quantity": 2
  }
}
```

| Field | Type | Description |
|---|---|---|
| `orderId` | integer | Order Service's internal order ID |
| `productId` | string | The product/SKU being ordered |
| `quantity` | integer | Units requested |

---

## `inventory.reserved`

**Published by:** Inventory Service
**Consumed by:** Payment Service

Fired when there was enough stock, and it has been deducted (reserved) for
this order.

```json
{
  "type": "inventory.reserved",
  "version": 1,
  "payload": {
    "orderId": 101,
    "productId": "sku-001",
    "quantity": 2
  }
}
```

| Field | Type | Description |
|---|---|---|
| `orderId` | integer | Matches the order this reservation is for |
| `productId` | string | The product reserved |
| `quantity` | integer | Units reserved |

---

## `inventory.failed`

**Published by:** Inventory Service
**Consumed by:** Order Service

Fired when there wasn't enough stock to fulfill the order.

```json
{
  "type": "inventory.failed",
  "version": 1,
  "payload": {
    "orderId": 101,
    "productId": "sku-001",
    "reason": "insufficient_stock"
  }
}
```

| Field | Type | Description |
|---|---|---|
| `orderId` | integer | The order that could not be fulfilled |
| `productId` | string | The product that was out of stock |
| `reason` | string | Machine-readable failure reason (currently only `insufficient_stock`) |

---

## `payment.succeeded`

**Published by:** Payment Service
**Consumed by:** Order Service

Fired when the (simulated) payment for a reserved order completed
successfully.

```json
{
  "type": "payment.succeeded",
  "version": 1,
  "payload": {
    "orderId": 101,
    "productId": "sku-001",
    "quantity": 2
  }
}
```

| Field | Type | Description |
|---|---|---|
| `orderId` | integer | The order that was successfully paid for |
| `productId` | string | Included for logging/traceability |
| `quantity` | integer | Included for logging/traceability |

---

## `payment.failed`

**Published by:** Payment Service
**Consumed by:** Order Service, Inventory Service

Fired when the (simulated) payment was declined. Note this has **two**
consumers: Order Service marks the order cancelled, and Inventory Service
independently reacts by releasing the stock it had reserved. Neither service
tells the other to do this — they each just react to the same event.

```json
{
  "type": "payment.failed",
  "version": 1,
  "payload": {
    "orderId": 101,
    "productId": "sku-001",
    "quantity": 2,
    "reason": "card_declined"
  }
}
```

| Field | Type | Description |
|---|---|---|
| `orderId` | integer | The order whose payment failed |
| `productId` | string | Needed by Inventory Service to know what to release |
| `quantity` | integer | Needed by Inventory Service to know how much to release |
| `reason` | string | Machine-readable failure reason (currently only `card_declined`) |

---

## Consumer summary table

A quick-reference view of who listens to what:

| Event | Published by | Consumed by |
|---|---|---|
| `order.created` | Order Service | Inventory Service |
| `inventory.reserved` | Inventory Service | Payment Service |
| `inventory.failed` | Inventory Service | Order Service |
| `payment.succeeded` | Payment Service | Order Service |
| `payment.failed` | Payment Service | Order Service, Inventory Service |

## Rules for adding a new event later

1. Every event gets its own section in this file, following the exact
   template above, **before** any code is written for it
2. Never change the shape of an existing `version` — add a new version
   instead, and document both until the old one is fully retired
3. A service should never consume an event that isn't documented here — if
   you find yourself needing to, that's a sign this catalog is out of date
   and needs updating first
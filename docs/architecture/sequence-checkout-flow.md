# Sequence Diagram — Checkout Flow

This traces exactly what happens, step by step, from a customer clicking
"Buy Now" to their order reaching a final state. It covers all three
possible outcomes: success, out-of-stock, and payment declined (with
rollback).

Cross-reference: every message name below matches an event defined in
[`docs/events/event-catalog.md`](../events/event-catalog.md) exactly. If you
ever see a mismatch between this diagram and that file while building, the
event catalog is the source of truth — update this diagram to match it, not
the other way around.

```mermaid
sequenceDiagram
    actor Customer
    participant Gateway as API Gateway
    participant Order as Order Service
    participant MQ as orders_exchange
    participant Inventory as Inventory Service
    participant Payment as Payment Service

    Customer->>Gateway: POST /orders (sku, quantity)
    Gateway->>Order: forward request
    Order->>Order: save order (status: pending)
    Order-->>Customer: 201 { orderId, status: pending }
    Order->>MQ: publish order.created

    MQ->>Inventory: order.created

    alt Enough stock available
        Inventory->>Inventory: reserve stock
        Inventory->>MQ: publish inventory.reserved
        MQ->>Payment: inventory.reserved

        alt Payment succeeds
            Payment->>Payment: charge (simulated/real)
            Payment->>MQ: publish payment.succeeded
            MQ->>Order: payment.succeeded
            Order->>Order: update status to confirmed

        else Payment declined
            Payment->>MQ: publish payment.failed
            MQ->>Order: payment.failed
            Order->>Order: update status to cancelled
            MQ->>Inventory: payment.failed
            Inventory->>Inventory: release reserved stock
        end

    else Not enough stock
        Inventory->>MQ: publish inventory.failed
        MQ->>Order: inventory.failed
        Order->>Order: update status to cancelled
    end

    Note over Customer,Payment: Meanwhile, the frontend polls<br/>GET /orders/:id every ~1.2s<br/>until status is confirmed or cancelled
```

## Reading this diagram

- The **first three messages** (Customer → Gateway → Order Service, and the
  `201` response back) are the only *synchronous* part of this entire flow.
  The customer's browser gets an immediate response with `status: pending`
  — it does not wait around for stock or payment to resolve
- Everything below that happens **independently of the customer's original
  request** — Order Service already responded and moved on
- The two `alt` blocks show the three possible endings: confirmed, cancelled
  (out of stock), or cancelled (payment declined + stock released)
- Notice Inventory Service and Payment Service **never message each other
  directly** — every arrow between them passes through `orders_exchange`.
  This is the event-driven decoupling from
  [ADR 0002](../../adr/0002-use-event-driven-communication-with-rabbitmq.md)
  made visible in a real flow, not just an abstract idea
- The final note explains how the *customer* actually finds out the result:
  polling. We chose polling for the MVP because it's simple and good enough
  at this scale — a documented, deliberate tradeoff, not an oversight. If
  this becomes a real limitation later (e.g. wanting instant push updates),
  that would be a good candidate for its own future ADR about WebSockets or
  Server-Sent Events.

## What this diagram deliberately leaves out

- Retry logic if a message fails to deliver (RabbitMQ's delivery guarantees
  are a topic for the Observability/hardening phases, not system design)
- Idempotency handling (what if `order.created` gets delivered twice?) — a
  known real gap, intentionally deferred and tracked as a future
  improvement rather than solved here
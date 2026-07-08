# 0002 — Use Event-Driven Communication with RabbitMQ

## Status
Accepted

## Context
Once we have multiple independent services (ADR 0001), they need to
communicate. For example: when an order is placed, Inventory needs to know
(to reserve stock), and Payment needs to know (to charge the customer).

The straightforward approach is direct HTTP calls between services (Order
Service calls Inventory Service's API directly). This is simple, but it
creates tight coupling: if Inventory Service is slow or down, Order Service's
request hangs or fails too. It also means every service needs to know the
exact API and network address of every other service it depends on.

## Decision
Services communicate asynchronously through events published to RabbitMQ,
instead of calling each other's APIs directly, for cross-service business
workflows (e.g. order → inventory → payment).

A service publishes an event describing something that happened (e.g.
`order.created`) without knowing or caring who's listening. Other services
subscribe to the events relevant to them and react independently.

## Consequences

**Gains:**
- Services are decoupled — Order Service doesn't need to know Inventory
  Service exists, only that an `order.created` event might interest someone
- If a service is temporarily down, events queue up in RabbitMQ and get
  processed once it's back — no lost requests
- New services can subscribe to existing events without any change to the
  services publishing them (e.g. adding a future Analytics Service that
  listens to `order.created` requires zero changes to Order Service)

**Costs:**
- Harder to reason about "what happens when X occurs" — the logic is spread
  across multiple services instead of one clear call chain
- Eventual consistency: there's a brief window where an order exists but
  hasn't been confirmed yet. The system has to be designed to tolerate this
  (e.g. showing "pending" status)
- Debugging requires tracing an event across multiple services and logs,
  which is harder than following a single stack trace

## Alternatives considered

**Direct HTTP calls (synchronous) between services:** simpler to trace and
debug, but creates tight coupling and cascading failures — if Payment Service
is down, Order Service's HTTP call fails immediately and the whole checkout
breaks, instead of the payment step simply waiting in a queue.

**gRPC for inter-service calls:** faster and more structured than REST, but
still fundamentally synchronous and tightly coupled — doesn't solve the core
problem we're addressing here.

**Kafka instead of RabbitMQ:** Kafka is a better fit for very high-throughput
event streaming and event replay/history. RabbitMQ was chosen for the MVP
because it's simpler to operate for this scale and has a lower learning
curve, while still teaching the core event-driven patterns. Revisiting Kafka
is a reasonable future decision once real throughput needs are known — that
would get its own new ADR at that time, not a retroactive edit of this one.
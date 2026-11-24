# 0005 — Use Events for Cross-Service Workflows Only

## Status
Accepted

## Context
[ADR 0002](./0002-use-event-driven-communication-with-rabbitmq.md) chose
RabbitMQ events over direct service-to-service calls. That decision was made
while designing the checkout flow, where one action (placing an order) must
trigger reliable reactions in several other services (reserve stock, charge
payment, roll back on failure).

Cart Service and Wishlist Service raised a different situation. Both store
a per-user list of SKUs. Adding to or removing from either list has no
effect on any other service. And a common user action, "move from wishlist
to cart", touches both services, so the question was whether it needs an
event too.

## Decision
Use RabbitMQ events when **an action in one service must cause reliable
reactions in other services without a user waiting for them**. Use plain
request/response, with no events, when a service's operations only affect its
own data.

For user-driven actions that touch two services and show an immediate
result to the user (such as "move to cart"), the **client orchestrates**:
it calls each service in turn. Services do not call each other, and no event
is published.

Cart Service and Wishlist Service therefore have no RabbitMQ connection.

## Consequences

**Gains:**
- No unnecessary infrastructure in services that don't need it: fewer
  moving parts, no queue to monitor, no broker dependency at startup
- Simple, immediate behavior: when "add to cart" returns, the item is in
  the cart, with no eventual-consistency window
- Services stay ignorant of each other, preserving the independence goals of
  ADR 0001 and ADR 0003

**Costs:**
- Client-orchestrated actions aren't atomic. If "add to cart" succeeds and
  "remove from wishlist" then fails, the item is in both places. This is
  acceptable here because the outcome is harmless and easily retried, but it
  would not be acceptable for something like moving money.
- Orchestration logic lives in the frontend (or a future backend-for-frontend
  layer), so every client must implement it
- If a later requirement needs other services to *react* to cart or
  wishlist changes (for example "abandoned cart" emails, or price-drop alerts
  for wishlisted items), those services will need to start publishing
  events. That is an additive change, but it is real work.

## Alternatives considered

**Publish events from every service, for consistency:** rejected. Events
nobody consumes add infrastructure and mental overhead without delivering the
decoupling that justified events in the first place.

**Wishlist Service calls Cart Service directly for "move to cart":**
rejected. It creates the direct coupling ADR 0001 and ADR 0003 exist to
prevent, and makes the wishlist endpoint fail whenever Cart Service is down.

**A "move to cart" event that Cart Service consumes:** rejected for now. It
would work, but it makes the cart update asynchronous, so a customer could
open their cart before the item appears. A synchronous, user-visible action
shouldn't be made asynchronous without a reason.

**A backend-for-frontend or API Gateway that orchestrates multi-service
actions:** reasonable, and likely to be revisited when the API Gateway is
built. It would move the orchestration out of the client without changing
the services themselves.
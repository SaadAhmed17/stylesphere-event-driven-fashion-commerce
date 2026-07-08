# 0003 — Database Per Service

## Status
Accepted

## Context
With multiple independent microservices (ADR 0001), a decision has to be made
about how they store data. The common shortcut is one shared database that
every service reads and writes to.

A shared database quietly destroys the independence microservices are
supposed to provide: any service can accidentally depend on another
service's table structure, a schema change in one service can silently break
another, and it becomes unclear which service actually "owns" a piece of
data.

## Decision
Each microservice owns its own PostgreSQL database, which no other service
is allowed to query or modify directly. Other services only ever get that
data through events (ADR 0002) or, later, through that service's own API.

## Consequences

**Gains:**
- Each service's database schema can change freely without breaking other
  services, as long as its published events stay consistent
- Crystal clear data ownership — if you want to know what's in an order,
  you ask Order Service, full stop
- Services can even use different database technologies later if a domain
  calls for it (e.g. Search Service could later move to Elasticsearch)
  without touching anyone else

**Costs:**
- No cross-service SQL joins — if you need data that spans two services
  (e.g. "show me the customer's name next to their order"), that has to be
  fetched from two services and combined in application code, or
  pre-combined via events
- More infrastructure to run and manage — one Postgres instance per service
  instead of one shared instance
- Data can become temporarily inconsistent across services (e.g. Order
  Service marks an order "confirmed" a moment before Inventory Service
  finishes reserving stock) — this is the same eventual-consistency tradeoff
  from ADR 0002, just visible at the data layer

## Alternatives considered

**One shared PostgreSQL database, separate schemas per service:** a common
middle-ground approach. Rejected here because it still allows accidental
tight coupling (nothing technically stops one service's code from querying
another schema directly), and doesn't teach the full discipline of true
service independence.

**One shared database, one set of tables:** the simplest option, but
recreates monolith-style coupling while still paying all the operational
costs of running microservices — worst of both worlds.
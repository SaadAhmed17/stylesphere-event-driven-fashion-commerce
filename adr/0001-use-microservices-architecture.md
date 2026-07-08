# 0001 — Use Microservices Architecture

## Status
Accepted

## Context
StyleSphere needs to support many independent domains: authentication, product
catalog, inventory, orders, payments, cart, wishlist, shipping, reviews,
recommendations, and more. These domains have very different scaling needs
(e.g. catalog is read-heavy, payments must be highly reliable) and different
rates of change (catalog changes often, auth rarely does).

A single monolithic application would force all of these domains to share one
codebase, one deployment, and one database — meaning a bug in the review
system could bring down checkout, and every deploy would risk the entire
platform.

## Decision
Build StyleSphere as a set of independent microservices, one per business
domain (auth, catalog, inventory, order, payment, etc.), each independently
deployable and independently scalable.

## Consequences

**Gains:**
- A failure in one service (e.g. Review Service) cannot crash unrelated
  services (e.g. Order Service)
- Services can be scaled independently (Catalog needs more capacity than
  Wishlist, for example)
- Teams (or, in this solo project, "future me") can work on one service
  without needing to understand the entire codebase
- Forces clean boundaries between domains, which is good discipline even in
  a solo project

**Costs:**
- Significantly more operational complexity than a monolith — more
  deployments, more moving parts, more things that can go wrong
- Debugging a request that spans multiple services is harder than debugging
  a single codebase (this is why we'll add correlation IDs later — see
  observability phase)
- Requires solving problems a monolith gets for free, like inter-service
  communication (see ADR 0002) and data consistency across services

## Alternatives considered

**Monolith:** simpler to build and deploy initially, but doesn't demonstrate
the distributed-systems skills this portfolio project is meant to showcase,
and doesn't reflect how large-scale e-commerce platforms are actually built
in industry.

**Modular monolith (one deployable, internally organized into modules):** a
reasonable middle ground, and genuinely a good choice for many real startups.
Rejected here specifically because the goal of this project is to learn and
demonstrate microservices patterns, not just clean code organization.
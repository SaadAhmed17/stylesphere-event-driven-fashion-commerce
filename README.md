# StyleSphere

**An event-driven, microservices-based fashion e-commerce platform.**

> 🚧 **Status:** Early development — Phase 0 (Foundations). Not yet runnable.

---

## What this is

StyleSphere is a full-stack e-commerce platform for a fashion retailer (men's,
women's, and kids' clothing and accessories), built the way a real e-commerce
company would build it — as independent microservices that communicate through
events rather than calling each other directly.

This is not a CRUD tutorial project. It's built in phases, with each
architectural decision documented, each service independently deployable, and
a development process (commits, issues, milestones) that mirrors how software
is actually built on a team.

## Architecture at a glance

Frontend → API Gateway → RabbitMQ (events) → Independent Microservices

Each microservice owns its own PostgreSQL database. Services never call each
other's APIs directly for business workflows — they publish and subscribe to
events. Full details, diagrams, and reasoning live in [`docs/architecture`](./docs/architecture)
and [`adr/`](./adr).

## Planned microservices

Authentication · User · Catalog · Inventory · Order · Payment · Cart ·
Wishlist · Address · Notification · Shipping · Review · Recommendation ·
Coupon · Analytics · Search · Audit · Admin

*(Built incrementally — see [Roadmap](#roadmap) below for build order.)*

## Tech stack

| Layer | Technology |
|---|---|
| Backend services | Node.js, Express |
| Databases | PostgreSQL (one per service) |
| Messaging | RabbitMQ (event-driven communication) |
| Frontend | React |
| Containerization | Docker, Docker Compose |
| CI/CD | GitHub Actions *(planned)* |

## Roadmap

This project is being built in two arcs:

1. **MVP** — a minimal but fully working store: Auth, Catalog, Inventory,
   Order, and Payment services, plus a storefront frontend.
2. **Expansion** — grows the MVP into the full 18-service platform listed
   above, with full observability, testing, and production deployment.

Detailed phase-by-phase breakdown is tracked in
[GitHub Milestones](../../milestones) and [GitHub Projects](../../projects).

## Documentation

- [`docs/architecture`](./docs/architecture) — system design, diagrams, sequence flows
- [`docs/events`](./docs/events) — event catalog (what gets published, by whom, consumed by whom)
- [`docs/database`](./docs/database) — database schemas per service
- [`docs/api`](./docs/api) — API documentation per service
- [`docs/deployment`](./docs/deployment) — deployment guides
- [`adr/`](./adr) — Architecture Decision Records, explaining *why* key choices were made

## Getting started

Currently runnable: **auth-service**, **catalog-service**, and
**inventory-service** (including live event-driven stock reservation via
RabbitMQ).

**Prerequisites:** Docker Desktop, running.

```bash
git clone https://github.com/SaadAhmed17/stylesphere-event-driven-fashion-commerce.git
cd stylesphere-event-driven-fashion-commerce
docker-compose up --build
```

Once running:
- Auth Service: `http://localhost:4003` — [API docs](./docs/api/auth-service.md)
- Catalog Service: `http://localhost:4004` — [API docs](./docs/api/catalog-service.md)
- Inventory Service: `http://localhost:4005` — [API docs](./docs/api/inventory-service.md)
- RabbitMQ dashboard: `http://localhost:15672` (admin / admin123)

More services will be added here as they're built — see [Roadmap](#roadmap).

## Author

Built by [Saad Ahmed](https://github.com/SaadAhmed17) as a personal portfolio project,
developed openly and incrementally with documented architecture decisions
and a real commit history.
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Project folder structure (`docs/`, `adr/`, `services/`, `frontend/`, `.github/`)
- `README.md` with project overview and architecture summary
- `CONTRIBUTING.md` with git workflow and commit conventions
- ADR 0001: Use microservices architecture
- ADR 0002: Use event-driven communication with RabbitMQ
- ADR 0003: Database per service
- ADR 0004: JWT-based authentication
- System architecture overview with MVP diagram (`docs/architecture/system-overview.md`)
- Event catalog defining all MVP checkout flow events (`docs/events/event-catalog.md`)
- Database schema design for MVP services (`docs/database/schema-overview.md`)
- Checkout flow sequence diagram covering success and failure paths (`docs/architecture/sequence-checkout-flow.md`)
- auth-service: user signup, login, and health check endpoints
- auth-service: JWT access tokens with 15-minute expiry
- auth-service: refresh token issuance, rotation, and revocation
- auth-service: authentication middleware and role-based access control (RBAC)
- auth-service: API documentation (`docs/api/auth-service.md`)
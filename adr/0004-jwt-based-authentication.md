# 0004 — JWT-Based Authentication

## Status
Accepted

## Context
StyleSphere has multiple user roles (Guest, Customer, Admin, Super Admin) and
many independent services (ADR 0001) that each need to know who's making a
request and what they're allowed to do — without all of them needing to call
a central Auth Service on every single request, which would create a
bottleneck and a single point of failure.

## Decision
Use JSON Web Tokens (JWT) for authentication. When a user logs in,
Authentication Service issues a signed token containing their identity and
role. The client sends this token on future requests. Any service can verify
the token's signature locally (using a shared secret or public key) without
needing to call Authentication Service for every request. Short-lived access
tokens are paired with longer-lived refresh tokens, so a stolen access token
has a limited window of danger, without forcing the user to log in
constantly.

## Consequences

**Gains:**
- Services can verify identity without a network call to Auth Service on
  every request — faster, and doesn't create a single point of failure
- Stateless: no need for a shared session store that every service must
  reach
- Role information (Customer/Admin/etc.) travels with the token, so RBAC
  (Role-Based Access Control) can be enforced at the API Gateway or in
  individual services

**Costs:**
- A JWT can't be "revoked" the instant it's issued the way a server-side
  session can — this is why we pair it with short expiry times and refresh
  tokens, to limit the damage window
- If the signing secret ever leaks, an attacker could forge valid tokens for
  any user — this makes secrets management (a later phase) a serious
  security requirement, not an optional nice-to-have
- Slightly more complex than simple session cookies, since we need refresh
  token rotation logic

## Alternatives considered

**Server-side sessions (session ID in a cookie, session data in a shared
store like Redis):** easier to revoke instantly, but requires every service
to reach a shared session store on every request, reintroducing the kind of
central dependency we're trying to avoid with microservices.

**OAuth2 with a third-party identity provider (e.g. Auth0, Firebase Auth):**
a legitimate production choice, and less code to maintain. Rejected for this
project specifically because building Authentication Service ourselves is
part of what this portfolio project is meant to demonstrate.
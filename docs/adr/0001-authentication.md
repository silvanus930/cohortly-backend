# ADR 0001: Stateless access tokens with rotating refresh tokens

- Status: accepted
- Date: 2026-09-03

## Context

The API serves a web client and, later, a mobile client. Both need to stay
signed in for weeks without storing passwords, while the platform needs a
reliable way to revoke access when an account is suspended, a password is
reset or a device is lost. Sessions stored server side would make every
request hit the database and complicate horizontal scaling under PM2.

## Decision

Authentication is split into two tokens.

1. A short lived JWT access token (15 minutes by default) carries the user
   id, email and role. It is verified with a shared secret by the Passport
   JWT strategy, which then reloads the user so role and status changes take
   effect on the next request even before the token expires.
2. An opaque refresh token (48 random bytes, 30 days by default) is stored
   hashed in the `refresh_tokens` table together with a `family` id. Using a
   refresh token issues a new pair and revokes the presented token. Presenting
   an already revoked token is treated as theft: the whole family is revoked
   and the client must sign in again.

A global `JwtAuthGuard` protects every route unless it is marked `@Public()`,
and a `RolesGuard` enforces `@Roles()` metadata with superadmins always
allowed through. Password resets use six digit codes emailed to the account
holder, stored hashed with an attempt counter, and revoke all refresh tokens
on success. Google sign in verifies an ID token server side and links or
creates the account by email.

## Consequences

- Access checks stay cheap and stateless; only refreshes touch the token
  table.
- Suspending a user takes effect on the next request because the strategy
  reloads the account, at the cost of one user lookup per request.
- Refresh token reuse detection means a stolen token cannot be replayed
  silently, but a buggy client that retries a refresh will be signed out.
- Secrets must be rotated carefully: changing `JWT_ACCESS_SECRET`
  invalidates every access token at once, which is acceptable given their
  short lifetime.

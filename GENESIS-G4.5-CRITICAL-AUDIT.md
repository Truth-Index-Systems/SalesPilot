# SalesPilot Genesis G4.5 — Ruthless Production Audit

## Scope

Reviewed security boundaries, public AI entry points, founder operations access, autonomous scheduler ownership, workspace isolation, human approvals, queue idempotency, migrations, AI governance, error recovery and route-aware scoring.

## Fixed — Critical / Important only

### 1. Public website reader network boundary

The public business-analysis endpoint accepted arbitrary HTTP(S) targets. Existing checks blocked common private addresses but missed several reserved ranges, link-local cloud metadata addresses, unsafe ports, credential-bearing URLs and oversized responses.

Hardening added:

- blocks IPv4 link-local, carrier-grade NAT, benchmark, multicast and reserved ranges
- blocks IPv6 unspecified, loopback, unique-local, link-local and multicast ranges
- blocks IPv4-mapped IPv6 private addresses
- blocks URL credentials
- restricts requests and redirects to standard HTTP/HTTPS ports
- validates every redirect before following it
- caps downloaded HTML at 2 MiB, including streamed responses without `Content-Length`

### 2. Anonymous AI budget abuse

Unauthenticated visitors could repeatedly create and execute business-analysis jobs until global AI governance limits were exhausted. This could consume launch credit and deny service to legitimate users.

Hardening added:

- durable database-backed limit of five public analyses per connection per 24-hour window
- authenticated workspace users are not subject to the public limit
- only an HMAC fingerprint is persisted; raw client IP addresses are never stored
- rate-limit mutation is atomic and service-role only

### 3. Founder Dashboard brute-force protection

The Founder Dashboard password endpoint had constant-time password comparison and a signed secure cookie, but no attempt limit.

Hardening added:

- ten attempts per connection per 15-minute window
- successful authentication clears the attempt window
- lockout state is shown without exposing password details
- persistent server-side enforcement works across serverless instances

## Audited and intentionally unchanged

- Scheduler route uses constant-time `CRON_SECRET` verification.
- Company and contact worker routes are tombstoned, preserving single-scheduler ownership.
- Pipeline lease and claim RPCs retain bounded, idempotent execution.
- Review RPCs enforce workspace scope and prevent Viewer mutations at the database boundary.
- Campaign launch/control remains Owner/Admin restricted.
- Opportunity and engagement reviews preserve human authority.
- Queue creation remains idempotent and recipient-timezone aware.
- Route-aware scoring and engagement prompts remain unchanged.
- No cosmetic, naming, formatting or speculative refactors were made.

## Deployment requirement

Apply migration `0047_genesis_g45_critical_security_hardening.sql` before deploying the application code.

`REQUEST_GUARD_SECRET` is recommended. When absent, the guard safely falls back to `DASHBOARD_SESSION_SECRET`, then `CRON_SECRET`.

# MarketRoute G5.1.1 — Anonymous Exploration Control + Landing Polish

## What changed

- The founder growth strip on the public landing page is now a stable, compact five-item layout instead of a wrapping text row.
- Anonymous visitors receive **3 complimentary website analyses by default** before MarketRoute asks them to create an account or sign in.
- The entitlement is enforced on the server and persisted in the existing `request_security_limits` table.
- Anonymous identity uses a signed, HttpOnly, SameSite=Lax visitor cookie. The raw browser identifier is never stored in the database; the database receives an HMAC fingerprint.
- A separate, deliberately higher IP safety ceiling reduces trivial cookie-reset abuse without making the IP address the customer-facing entitlement.
- Authenticated users bypass the anonymous allowance entirely.
- The campaign wizard shows the live remaining allowance and replaces retry behaviour with Create account / Sign in when the allowance is exhausted.

## Deployment controls

All values are optional. The defaults are release-safe:

```env
MARKETROUTE_ANONYMOUS_ANALYSIS_LIMIT=3
MARKETROUTE_ANONYMOUS_ANALYSIS_WINDOW_DAYS=365
MARKETROUTE_ANONYMOUS_ANALYSIS_IP_DAILY_LIMIT=30
```

`MARKETROUTE_ANONYMOUS_ANALYSIS_LIMIT=0` disables anonymous website analysis completely without a code change.

`REQUEST_GUARD_SECRET` remains recommended. Existing fallback behaviour to `DASHBOARD_SESSION_SECRET` and then `CRON_SECRET` is preserved.

## Database

No new migration is required. This release reuses the hardened `request_security_limits` table and `consume_request_security_limit` RPC introduced in Genesis G4.5.

## Boundary note

Before authentication, MarketRoute cannot know a real-world human identity without invasive fingerprinting. The entitlement is therefore correctly defined as **per persistent anonymous browser/device**. This is the strongest privacy-respecting deterministic boundary available before account creation. The IP ceiling is only an abuse guard.

## Validation

- G5.1.1 anonymous allowance validation: PASS
- Public landing validation: PASS
- Speed R1: PASS
- Speed R2: PASS
- Speed R3: PASS
- Speed R4: PASS
- Speed R5: PASS
- Changed TS/TSX syntax transpilation: PASS

A full dependency-backed Next.js build was not run in this workspace because the archive intentionally does not contain `node_modules`.

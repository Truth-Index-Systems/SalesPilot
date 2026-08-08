# MarketRoute Genesis G5.1.13.2 — Parallel Evidence Engine

## Purpose
Release 2 removes the serial official-evidence bottleneck introduced after breadth discovery. R1 made candidate companies visible early; R2 verifies those candidates as independent, bounded work units so one slow website cannot block the rest of an archetype.

## Architecture
- `company_discovery_candidates` now has a four-state lifecycle: `DISCOVERED -> VERIFYING -> VERIFIED | HELD`.
- Each candidate verification receives its own worker token, lease and attempt counter.
- Verification runs in a bounded pool (default 3, maximum 5) controlled by `MARKETROUTE_COMPANY_EVIDENCE_CONCURRENCY`.
- A failed candidate is returned to `DISCOVERED` for an independent retry. After three attempts it is safely held with `VERIFICATION_TECHNICAL_FAILURE` rather than blocking the entire market pass.
- The archetype cursor cannot advance while any candidate remains `DISCOVERED` or `VERIFYING`.
- Verified companies still enter the canonical `companies` table only through the existing official evidence gate. No scoring or route-quality rules are weakened.

## Deployment
Apply `supabase/migrations/0106_marketroute_g51132_parallel_evidence_engine.sql` before deploying the app.

Optional environment control:

`MARKETROUTE_COMPANY_EVIDENCE_CONCURRENCY=3`

Accepted range is 1–5. Three is recommended for launch to balance latency against outbound website load and serverless connection pressure.

## Recovery
The migration is compatible with R1 rows. Existing `DISCOVERED`, `VERIFIED` and `HELD` candidates remain valid. If a serverless worker dies while a candidate is `VERIFYING`, its lease expires and a later scheduler run can reclaim only that candidate without repeating successful evidence checks for its neighbours.

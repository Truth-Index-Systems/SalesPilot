# MarketRoute Genesis G5.1.13.4 — Authority & Polish Freeze

## Purpose
Freeze the R1–R3 incremental Company Discovery architecture after an end-to-end authority, recovery, timeline and legacy-path audit. This release does not change company fit scoring, evidence quality rules, commercial-priority scoring, Route Intelligence, Contact Discovery quality or Opportunity Assembly.

## Audit findings
- R1 candidate staging remains separated from canonical evidence-verified companies.
- R2 candidate evidence work remains independently worker-token fenced and bounded in parallel.
- R3 is progressive prioritisation, not filtering: lower priority tiers remain eligible for downstream research.
- The fenced `_owned` contact-discovery planner/claimant intentionally delegate to the implementation RPCs as SECURITY DEFINER wrappers; the application service role cannot execute the unfenced entry points directly. The R3 ordering therefore remains effective through the owned runtime boundary.
- A real recovery edge remained: a verification worker that disappeared after exhausting its retry budget could leave a candidate in `VERIFYING` until that exact candidate was touched again.
- Several historical timeline writes were not idempotent across resume/retry boundaries, which could make safe recovery look like duplicate work.

## Changes
1. Candidate verification records retain first-start and terminal timestamps.
2. Expired `VERIFYING` leases at the retry ceiling are automatically moved to `HELD / VERIFICATION_TECHNICAL_FAILURE`.
3. Candidate claim refuses a fourth evidence attempt.
4. Archetype verification-state inspection also repairs stale over-budget leases, ensuring an orphan cannot hold the archetype cursor forever.
5. Candidate-found, archetype-complete and background-AI-continuing timeline events are database-deduplicated through the existing `activityOnce` authority.
6. No intelligence/scoring thresholds or downstream commercial contracts changed.

## Migration
Apply `0108_marketroute_g51134_authority_polish_freeze.sql` before deploying the application bundle.

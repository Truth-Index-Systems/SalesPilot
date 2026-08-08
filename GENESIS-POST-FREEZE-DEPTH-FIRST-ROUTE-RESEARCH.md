# Genesis Post-Freeze — Depth-First Route Research

## Purpose

Route Intelligence previously yielded for 15 seconds after an expansion pass. With multiple approved companies, that allowed the next scheduler invocation to start another company before the current account had finished its route research. The customer experience looked like shallow round-robin research.

## New invariant

Once MarketRoute begins Route Intelligence for an approved company, that account remains the preferred runnable Route Intelligence job until it reaches one of these boundaries:

- `READY` — primary and independent fallback route exist.
- `EXHAUSTED` — all safe route expansion passes completed.
- terminal failure.
- campaign/company no longer eligible.
- genuine retry backoff is still in the future.

Only then does fresh Route Intelligence for the next company take the lane.

## Changes

- Expansion passes are eligible immediately on the next scheduler lease instead of sleeping for 15 seconds.
- `claim_contact_discovery` prioritises already-started sessions and then the deepest expansion pass.
- `plan_contact_discovery_dispatch` uses the same ordering so planner and claimant cannot disagree about which campaign owns the next heavyweight route slot.
- Existing scheduler ownership fencing, one-heavyweight-worker-per-run, AI governance budgets, route readiness requirements, four-pass cap, retry policy, and G4/G5 boundaries are unchanged.

## Result

Expected customer-visible order:

`Company A pass 1 → Company A pass 2 → ... → Company A READY/EXHAUSTED → Company B pass 1 → ...`

rather than:

`Company A pass 1 → Company B pass 1 → Company C pass 1 → Company A pass 2 → ...`

## Migration

Apply:

`0086_genesis_post_freeze_depth_first_route_research.sql`

## Source-diversity hardening

Expansion prompts now explicitly prioritise new independent official source URLs and access paths. Re-reading an already-used URL is not treated as expansion progress unless that source genuinely needs to be revalidated. The structured output schema and evidence acceptance rules are unchanged.

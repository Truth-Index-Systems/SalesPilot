# Genesis G4.7.6 — Opportunity Readiness Freeze

## Root cause

G4.7 Route Intelligence had replaced Contact Discovery conceptually, but `sync_opportunity_foundations()` still carried the G3 readiness rule: the existence of any contact row could mark an opportunity `READY`. Partial/legacy contact evidence could therefore make an opportunity reviewable while Route Intelligence was still `RESEARCHING` or `EXPANDING`.

The opportunity UI compounded this by allowing every visible row to be selected and bulk-approved, including `BUILDING` opportunities. The database review RPC also had no Route Intelligence readiness gate.

## Contract after this release

Company approval unlocks Route Intelligence. Route Intelligence readiness unlocks Opportunity approval.

- `BUILDING`: Route Intelligence is still researching/expanding. Visible, but not reviewable.
- `READY`: Route Intelligence state is `READY` and a viable commercial route exists. Review/approval is unlocked.
- `NEEDS_CONTACT` / `NEEDS_EVIDENCE`: research completed/exhausted without a sufficient route. Cannot be approved as a completed opportunity.
- `APPROVED`: only reachable from `READY` through the server-side review RPC.

## Changes

- Replaced legacy contact-driven readiness in `sync_opportunity_foundations()` with Route Intelligence state-driven readiness.
- Prevented `apply_route_intelligence_opportunity_scoring()` from promoting partial route results to `READY` while research is active.
- Added a hard database approval gate requiring opportunity `READY`, Route Intelligence `READY`, and at least one viable commercial route.
- Repaired impossible `APPROVED` rows with incomplete Route Intelligence when no engagement has begun.
- Opportunity cards now label `BUILDING` as `Research in progress` and cannot be selected for review.
- Recommended/Worth Reviewing metrics only count `READY` opportunities.
- While building, evidence copy explicitly distinguishes existing company evidence from route evidence still being researched.

## Frozen boundaries

No Company Discovery search, evidence, scoring, expansion, approval or replenishment logic was changed.

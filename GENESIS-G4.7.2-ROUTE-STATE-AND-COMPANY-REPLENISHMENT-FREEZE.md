# Genesis G4.7.2 — Route State Contract + Company Replenishment Freeze

## Production failure fixed

`evaluate_contact_discovery_route_readiness()` legitimately transitions a Route Intelligence session to `stage='EXPANDING'` when the first route package does not yet contain a strong primary route plus an independent fallback. The original G3 `contact_discovery_sessions_stage_check` constraint still allowed only `PREPARING`, `RESEARCHING`, `IDENTIFYING`, `VALIDATING`, `SAVING`, and `COMPLETE`. The G4.7 runtime and database contract were therefore inconsistent.

Migration `0067_genesis_g472_route_state_and_company_replenishment_freeze.sql` explicitly replaces the historical stage constraint and adds `EXPANDING`. Sessions interrupted specifically by that constraint failure are requeued without discarding persisted Route Intelligence findings.

## Company Discovery replenishment contract

The previous scheduler restarted Company Discovery whenever `PENDING_REVIEW < queue_floor` (default 6). A successful discovery cycle can intentionally return only 3–4 evidence-backed companies, so that rule could queue another search cycle immediately after the first cycle finished—even before the current company batch had actually been consumed.

G4.7.2 changes the scheduler-owned restart trigger to:

`PENDING_REVIEW = 0`

This creates discrete review batches and avoids unnecessary discovery churn.

The downstream pipeline remains streaming. Once the current company review batch is cleared, newly approved companies can continue through Route Intelligence while the next Company Discovery cycle runs in parallel. Route Intelligence completion is not a prerequisite for company replenishment.

Approved companies are never returned to Company Review by Route Intelligence. Later route/contact/evidence enrichment changes the opportunity, not the original company approval decision.

## Frozen boundary

No Company Discovery planning, search ordering, evidence verification, expansion strategy, candidate scoring, or AI response logic was modified. Only the scheduler replenishment trigger was tightened.

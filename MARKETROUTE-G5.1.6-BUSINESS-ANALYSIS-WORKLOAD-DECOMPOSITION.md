# MarketRoute Genesis G5.1.6 — Business Analysis Workload Decomposition

## Purpose
Remove the long 52% Business Analysis stall by replacing the monolithic Business DNA + campaign-generation request with two independently resumable AI phases.

## Runtime flow
1. Website read -> 20%
2. Core Business DNA (low reasoning, bounded output) -> persisted at 70%
3. Growth Strategy (medium reasoning, consumes persisted Core DNA) -> 72–92%
4. Deterministic final assembly -> 100%

The canonical downstream `analysis_json` / `business-dna/v1` contract is unchanged. Company Discovery and every later Genesis stage continue consuming the same final Business DNA shape.

## Reliability behaviour
- Core Business DNA is checkpointed in `business_analysis_jobs.core_analysis_json`.
- If Growth Strategy defers, times out or retries, Core Business DNA is not regenerated.
- Background OpenAI handoff preserves the current stage/progress rather than reverting to the old monolithic `ANALYSING_BUSINESS` state.
- Progress remains monotonic.
- Anonymous/public AI governance remains explicit and unchanged from G5.1.5.
- Complimentary analysis entitlement is still consumed per analysis job, not per AI phase/retry.

## Migration
Apply:

`supabase/migrations/0100_marketroute_g516_business_analysis_workload_decomposition.sql`

It adds the nullable Core checkpoint and the owned persistence RPC, then hardens progress/background-defer behaviour for the decomposed state machine.

## Optional cost tuning
Defaults split the previous ~$0.10 Business Analysis reservation estimate into:
- `MARKETROUTE_BUSINESS_ANALYSIS_CORE_ESTIMATED_COST_USD=0.04`
- `MARKETROUTE_BUSINESS_ANALYSIS_GROWTH_ESTIMATED_COST_USD=0.06`

These are governance estimates, not customer-visible credits.

## Validation
Passed:
- `marketroute:g516-check`
- `marketroute:g515-check`
- Speed R1
- Speed R2
- Speed R3
- Speed R4
- Speed R5

A full `npm ci` / `npm run typecheck` could not be run in the artifact environment because its internal npm mirror returns 404 for the existing lockfile dependency `zod@3.24.2`. No dependency versions were changed by G5.1.6.

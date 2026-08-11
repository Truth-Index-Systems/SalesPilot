# Genesis G8.2 — Idle Capacity Spillover

## Problem

The capacity governor previously entered `CUSTOMER_ONLY` whenever governed daily usage reached 90%, even when there was no live customer work. This set `backgroundGrowthPercent=0`, `maximumBackgroundRepairs=0`, `mayDepth=false`, and `mayGrow=false`, leaving queued autonomous expansion work untouched despite unused hard daily budget.

A second configuration mismatch meant the Vercel `MARKETROUTE_PUBLIC_AI_*` limits governed the public-analysis lane, while the Genesis system organisation continued reading its persisted `ai_governance_policies` limits. Raising the Vercel values therefore did not necessarily raise the autonomous Genesis budget.

## Fix

1. `CUSTOMER_ONLY` is now triggered by actual `liveCustomerWorkPending`, not by the 90% utilisation threshold alone.
2. With no live customer work, utilisation >=75% uses `CONSERVATIVE` mode and Genesis may consume only the actual remaining hard workspace budget.
3. The existing hard reservation boundary remains authoritative. No AI request can exceed `ai_governance_policies.daily_cost_limit_usd` or the request limit.
4. A service-role-only RPC synchronises the Genesis system organisation's request/cost ceilings from runtime configuration before each capacity snapshot.
5. Preferred system variables are `MARKETROUTE_G8_AI_DAILY_REQUEST_LIMIT` and `MARKETROUTE_G8_AI_DAILY_COST_LIMIT_USD`; current `MARKETROUTE_PUBLIC_AI_*` values are accepted as backwards-compatible fallbacks.
6. Autonomy state is never modified by the synchronisation RPC.

## Recommended runtime configuration

- `MARKETROUTE_G8_AI_DAILY_COST_LIMIT_USD=100`
- `MARKETROUTE_G8_AI_DAILY_REQUEST_LIMIT=5000`
- `MARKETROUTE_G8_BACKGROUND_DAILY_BUDGET_USD=100`
- `MARKETROUTE_PUBLIC_AI_IN_FLIGHT_LIMIT=24` remains for public analysis; Genesis organisation concurrency remains governed by the bounded server-side cap introduced in migration 0148.

## Expected result

With no live customer campaign and $48.328 spent against a $100 daily limit, Genesis should remain eligible for depth/expansion. It should stop only when the hard daily budget/request ceiling is actually exhausted or live customer work creates a higher-priority lane.

## Migration

Apply `0149_genesis_g82_idle_capacity_spillover.sql` before deploying the application code.

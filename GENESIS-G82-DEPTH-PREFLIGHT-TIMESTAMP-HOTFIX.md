# Genesis G8.2 Depth Preflight + Timestamp Boundary Hotfix

## Root cause confirmed

The $100 change in `capacity-budget.ts` raises Genesis's desired background envelope only. The authoritative workspace daily cost ceiling still comes from `public.ai_governance_policies.daily_cost_limit_usd` for `MARKETROUTE_G8_SYSTEM_ORGANISATION_ID`, and `reserve_ai_request` remains final authority.

If the capacity decision is `CUSTOMER_ONLY`/`PAUSED`, or workspace remaining spend is zero, `maximumBackgroundRepairs` becomes 0 and depth claim/settle calls are correctly skipped.

## Patch

1. `ensure_genesis_g82_depth_backlog` is now a deterministic/free preflight executed before the capacity gate on every operator run.
2. `claim_genesis_g82_depth_jobs` and AI work remain governed and execute only when `mayDepth` is true.
3. Depth still runs before breadth expansion.
4. MR-TI-2 repair hard acceptance now requires valid RFC3339 timestamps (or null for `sourcePublishedAt`). Malformed values such as `2026-05-` cannot reach PostgreSQL timestamptz persistence.

## Production validation

On the next `/api/autonomy/genesis-g8/operate/run` call, `ensure_genesis_g82_depth_backlog` should appear regardless of available AI capacity.

If `ensure...` appears but `claim...` does not, inspect the returned capacity object / capacity budget event. The workspace governor is still blocking depth. Confirm the system organisation's `ai_governance_policies.daily_cost_limit_usd` is the intended value (for example 100) and that today's governed spend/request ratios leave capacity.

Success remains:

- `ensure_genesis_g82_depth_backlog`
- `claim_genesis_g82_depth_jobs`
- `settle_genesis_g82_depth_job`
- Founder Dashboard contact/route counts begin increasing.

Do not resume MR-R1 Build 3 until those conditions are met.

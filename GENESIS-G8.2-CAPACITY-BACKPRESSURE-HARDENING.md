# Genesis G8.2 Capacity & Backpressure Hardening

## Objective
Keep autonomous Genesis researching continuously without treating temporary organisation-level AI capacity pressure as a terminal job failure.

## Changes
- Organisation-level active heavy AI reservation cap raised from **2 to 12**.
- Daily request and daily cost governance remain unchanged and authoritative.
- Expansion and exact-repair workers no longer consume retry budget when settlement is deferred because of:
  - `OPENAI_BACKGROUND_PENDING`
  - `AI_PARALLEL_CAPACITY`
  - `AI_GOVERNANCE_BLOCKED`
- Historical `FAILED` expansion/repair rows caused specifically by parallel capacity pressure are safely returned to `QUEUED`.
- Historical provider billing/no-credit failures remain `FAILED` and are **not** requeued.
- Autonomous operations now attempts up to **2 depth jobs** and **2 expansion jobs** per operator cycle, still subject to reservation/budget governance.
- Lease fencing, idempotent request keys, and background-response resume semantics are unchanged.

## Migration
Apply:
`0148_genesis_g82_ai_capacity_backpressure_hardening.sql`

## Expected production behaviour
When all 12 organisation slots are occupied, new AI work remains queued and retries later. It should not burn through expansion/repair attempt counts merely because capacity is temporarily unavailable.

## Verification
After deployment, confirm queued expansion rows begin receiving attempts/OpenAI background responses and that `PARALLEL_ORGANISATION_LIMIT` does not accumulate as terminal `FAILED` work.

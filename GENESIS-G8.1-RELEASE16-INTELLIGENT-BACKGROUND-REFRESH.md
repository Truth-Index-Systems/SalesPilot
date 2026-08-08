# Genesis G8.1 Release 16 — Intelligent Background Refresh

R16 makes Knowledge Intelligence proactive. It finds public claims whose evidence freshness has decayed, ranks them by freshness debt, contract criticality and demonstrated recent campaign reuse, then queues the exact claim through the existing R9 Discovery Repair worker.

## Constitutional boundaries

- Background refresh never calls AI directly.
- R9 remains the only exact-repair model executor.
- Live customer-scoped repair work always outranks background refresh.
- Refresh is claim-specific; it never widens into whole company/contact/route discovery.
- Truth Index is recalculated only after sourced evidence returns.
- Human rejection/suppression remains authoritative.
- No new cron is activated by this release.

## Priority

Priority is deterministic and based on:

1. freshness debt (1 - current freshness),
2. claim criticality,
3. recent campaign reuse of the shared entity,
4. a modest reliability/value factor from current Truth Index.

This keeps frequently reused critical intelligence fresh while allowing low-value optional facts to wait.

## New production boundary

`GET /api/autonomy/genesis-g8/refresh/run`

Protected with the existing `CRON_SECRET`. The endpoint only schedules bounded exact repairs; `/api/autonomy/genesis-g8/repairs/run` continues to consume them.

## Migration

`0118_genesis_g81_release16_intelligent_background_refresh.sql`

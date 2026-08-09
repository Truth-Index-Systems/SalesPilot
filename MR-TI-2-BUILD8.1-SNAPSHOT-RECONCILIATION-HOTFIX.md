# MR-TI-2 Build 8.1 — Production Snapshot Reconciliation Hotfix

## Defect
Build 8 activated MR-TI-2 only on evidence/research events. Entities created or populated by a preceding deployment could therefore exist without a `genesis_g8_truth_v2_snapshots` row. A subsequent empty heartbeat had no work that would trigger V2 calculation, leaving the dashboard empty/stale.

The active read repository also still fetched the legacy `genesis_g8_truth_snapshots` row even though production hydration no longer needed it.

## Fix
- Add bounded `reconcileMissingMrTi2Snapshots()` to every Genesis G8 heartbeat.
- Reconciliation performs no AI calls.
- Active entities missing V2 snapshots are detected.
- Existing persisted evidence missing V2 primitive assessments is deterministically backfilled using the same source-authority mapping and stored evidence strength/traceability used by the production acquisition adapter.
- MR-TI-2 is calculated and persisted after backfill.
- Active knowledge bundle reads no longer query legacy TI-1 snapshots.
- Dashboard copy now reflects production MR-TI-2 rather than Build 7 shadow wording.

## Safety
- No tables dropped or mutated.
- No historical TI-1 rows rewritten.
- Existing evidence is preserved.
- Reconciliation is capped at 8 entities per heartbeat.
- Once an entity has a V2 snapshot it is excluded from this missing-snapshot backfill path; normal event-driven V2 recalculation remains authoritative thereafter.

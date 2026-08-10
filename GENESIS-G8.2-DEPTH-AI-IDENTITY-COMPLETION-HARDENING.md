# Genesis G8.2 — Depth AI Identity + Completion Hardening

## Purpose

Separates background depth enrichment from breadth expansion at the AI governance/background-response boundary and recovers already-paid completed depth responses that were previously stranded.

## Changes

- Adds `GENESIS_G82_DEPTH` as a first-class governed AI job type.
- Gives depth its own timeout/workload profile and background checkpoint identity.
- Keeps the same workspace budget and heavy parallelism limits; no governance bypass is introduced.
- Preserves compatibility with pre-hardening depth checkpoints recorded as `GENESIS_G82_EXPANSION`.
- Reuses completed legacy `genesis-g82-depth:*` checkpoints for the same depth job before any new provider submission.
- Requeues legacy depth jobs that were incorrectly marked `COMPLETED 0/0` when a completed provider response exists and no contact/route membership was persisted.
- Emits explicit legacy response reuse/rejection telemetry.

## Expected production sequence

`JOB_CLAIMED -> LEGACY_BACKGROUND_COMPLETED_REUSED or dedicated GENESIS_G82_DEPTH background resume -> RESEARCH_ACCEPTED -> CONTACT/ROUTE_PERSIST_* -> SETTLE_COMPLETED`.

## Constitutional boundaries

CE-R1 and CE-R2 are unchanged. AI still owns semantics only; Truth Index remains truth authority; UDOSIB remains deterministic commercial reasoning authority.

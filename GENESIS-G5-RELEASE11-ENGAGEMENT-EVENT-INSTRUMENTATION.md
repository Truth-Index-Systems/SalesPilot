# SalesPilot Genesis G5 — Release 11: Engagement Event Instrumentation

## Boundary
Release 11 records clean engagement facts for future Reply Intelligence and learning. It does **not** interpret replies, generate replies, progress deals, optimise campaigns, alter G4 truth, or change the G5 state machine.

## New canonical learning ledger
`engagement_events` is append-only and separate from `engagement_strategy_events`.

`engagement_strategy_events` remains the orchestration/state audit authority.
`engagement_events` is the stable business-event feed for future learning.

Stable event names:
- MESSAGE_GENERATED
- MESSAGE_REWRITTEN
- ROUTE_SELECTED
- ROUTE_CHANGED
- MESSAGE_EDITED
- APPROVED
- REJECTED
- QUEUED
- SENT
- DELIVERED
- BOUNCED
- REPLY_RECEIVED

## Regression-safe projection
A database trigger projects only meaningful facts from the existing authoritative G5 strategy event stream. R2-R10 execution functions are not rewritten.

Each event has an idempotent `event_key`. Strategy-derived facts are keyed by the source strategy-event UUID, so retry/replay cannot create duplicates.

## Point-in-time snapshots
Newly recorded events may include the exact message, route and quality snapshots that existed when the fact occurred. Later edits cannot rewrite event history.

Historical R3-R10 events are backfilled conservatively from their original audit metadata and explicitly tagged `historicalProjection=true`; current mutable strategy data is not falsely presented as historical state.

## External facts
`record_g5_engagement_external_event(...)` accepts only:
- DELIVERED
- BOUNCED
- REPLY_RECEIVED

It is service-role only, requires a SENT engagement and an idempotent provider event ID, and records facts only. It performs no reply interpretation or learning.

## Migration
Apply `0083_genesis_g5_release11_engagement_event_instrumentation.sql`.


## SQL compatibility hotfix

`record_g5_engagement_external_event` no longer has a compile-time dependency on `public.g5_engagement_execution_queue`. It detects the R9 execution relation dynamically and falls back to the immutable SENT strategy route/channel snapshot when that relation is absent. This keeps R11 deployable in environments where R9 application code was deployed before migration 0082 was applied, without permitting external events for non-SENT strategies.

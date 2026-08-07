# SalesPilot Genesis G5 — Release 13 Freeze Audit

Release 13 adds no product feature. It closes authority, retry, and stale-execution defects found in the final G5 audit.

## Freeze findings repaired

1. **R2 retry gap** — Commercial Reasoning could enter `FAILED_RETRYABLE` but the R2 worker only reclaimed `WAITING`. A dedicated stage-specific claimant now resumes only `COMMERCIAL_REASONING` retries and cannot steal failures owned by R3/R4/R5/R6/R7.
2. **Legacy G4 engagement scheduler leak** — the scheduler still executed the old G4 engagement builder/strategy/learning pipeline before G5. Those calls are removed. G5 seeds directly from approved immutable Opportunities.
3. **Legacy mutable UI/API surface** — `/replies` and `/api/engagements/*` could still mutate the pre-G5 engagement domain. The pages now route users to Opportunities, the HTTP mutation endpoints return `410 Gone`, and the legacy database mutation RPCs are revoked from runtime roles.
4. **Stale transport completion** — R9 could insert a `QUEUED -> SENT` event even if the strategy update no longer matched `QUEUED`. Completion is now state-fenced and aborts unless exactly one canonical strategy advances.

## Frozen authority map

- G4 owns Business DNA, company/contact evidence, Route Intelligence, commercial routes, Opportunity readiness and scoring.
- G5 R1 owns the engagement state machine.
- R2 owns commercial reasoning.
- R3 owns channel strategy.
- R5 owns deterministic personalisation safety.
- R4 owns channel-specific generation, including R6 rewrite instructions.
- R6 owns mandatory self-review and bounded rewrite policy.
- R7 owns deterministic Engagement Confidence.
- R8 owns authenticated human approval/edit/reject/route override.
- R12 owns deterministic Autopilot approval only.
- R9 owns queue and transport execution.
- R10 is read-only observability.
- R11 is append-only factual event instrumentation.

No legacy G4 engagement worker, review RPC, queue builder, or learning builder is part of the live scheduler after this release.

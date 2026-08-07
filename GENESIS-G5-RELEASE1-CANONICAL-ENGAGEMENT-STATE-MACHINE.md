# SalesPilot Genesis G5 — Release 1
## Canonical Engagement State Machine

Release 1 establishes a new G5-owned execution authority without changing G4 truth.

### Boundary
- `opportunities` remains G4-owned and immutable to G5.
- `opportunity_engagements` remains the frozen G4 handoff/legacy execution surface.
- `engagement_strategies` is the new canonical G5 lifecycle record, keyed one-to-one to the approved Opportunity.
- Release 1 does not yet wire G5 workers into the scheduler; later controlled releases will consume this authority.

### Lifecycle
`WAITING -> REASONING -> STRATEGY_READY -> GENERATING -> SELF_REVIEW -> READY_FOR_APPROVAL -> APPROVED -> QUEUED -> SENT`

Failures: `FAILED_RETRYABLE`, `FAILED_TERMINAL`.

### Reliability
Every worker claim is scheduler-owned and lease-token fenced. Completion/failure requires the same scheduler run and lease token. Expired/stale workers cannot commit. Retry scheduling preserves prior valid G4 intelligence because no G4 intelligence is rewritten.

### Migration
Apply `0074_genesis_g5_release1_canonical_engagement_state_machine.sql` after G4.7.11 migrations.

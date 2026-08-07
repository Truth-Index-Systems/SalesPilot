# Genesis G4 Orchestration State Contract Audit

## Scope

Audited Company Discovery from scheduler preparation through claim, worker execution, technical retry, lease recovery, expansion, completion, and client refresh.

## Important findings

1. The original `discovery_sessions.stage` check constraint was not explicitly evolved to the complete G4 vocabulary. This created a schema/runtime drift risk for `PLANNING`, `VERIFYING`, `EXPANDING`, `TECHNICAL_RETRY`, `READY`, and `NEEDS_ATTENTION`.
2. `recover_pipeline_jobs` still restored expired Company Discovery work with the legacy `PREPARING` stage, losing whether the interrupted phase was planning, searching, or verification.
3. Recovered and retryable rows did not consistently clear all claim ownership fields.
4. The claim ordering did not prioritise a due technical retry over fresh queued work.
5. The client refresh snapshot omitted `updated_at`, `next_attempt_at`, `attempt_count`, and `last_error_code`, allowing meaningful database transitions to occur without changing the watched snapshot.

## Fixes

- Added migration `0061_genesis_g4_orchestration_state_contract_hardening.sql`.
- Replaced the legacy stage constraint with the complete G4 state vocabulary.
- Normalised active queued/retry rows without changing their absolute retry instants.
- Rebuilt lease recovery to preserve technical-failure semantics and interrupted phase.
- Cleared stale claim ownership during recovery and normalisation.
- Rebuilt Company Discovery claim selection with explicit canonical states and due-retry priority.
- Preserved `EXPANDING` when an expansion pass is claimed.
- Expanded the client snapshot to observe all meaningful orchestration changes.

## Runtime conclusion

There is one active pipeline scheduler and one active Company Discovery worker. No duplicate executor or competing state machine was found. Historical migrations and regression validators remain intentionally.

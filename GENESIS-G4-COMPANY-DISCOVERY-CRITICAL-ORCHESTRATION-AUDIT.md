# Genesis G4 – Company Discovery Critical Orchestration Audit

## Verdict

The first-search instability had two concrete pre-search failure paths in the supplied ZIP. The strongest root cause was SQL/runtime state-machine drift: the effective `update_company_discovery_progress()` function was still the legacy G2 implementation and rejected `PLANNING` and `VERIFYING`. The deterministic TypeScript planner also built values longer than its own Zod schema allowed, so campaign-specific text could throw during `PLANNING` before any OpenAI/web search began.

Both defects are corrected in this build. The evidence gate is unchanged.

## Root causes corrected

1. **Legacy G2 progress RPC still active**
   - Runtime worker transitions to `PLANNING` and `VERIFYING`.
   - Effective SQL RPC accepted only `PREPARING`, `SEARCHING`, `ANALYSING`, `VALIDATING`, `SAVING`, `COMPLETE`.
   - Result: `PLANNING` could fail immediately with `invalid discovery stage`, producing a technical retry before the first search.
   - Fix: migration `0062_genesis_g4_discovery_orchestration_root_cause_fix.sql` replaces the RPC with the G4 running-state contract and refreshes heartbeat/lease/`updated_at` on every transition.

2. **Deterministic planner could violate its own schema**
   - Campaign objective can be up to 500 chars.
   - Planner embedded it inside `operationalConditions`, whose item maximum is 220 chars.
   - Buyer-role and related strings had similar unbounded paths into 120/180/220-char fields.
   - Result: strict `CompanySearchPlanSchema.parse()` could throw in deterministic `PLANNING`.
   - Fix: deterministic clipping/deduplication now guarantees generated planner fields fit the schema before parsing.

3. **Telemetry could fail business execution**
   - `record_discovery_activity` was awaited as a hard dependency.
   - A timeline/ticker write failure could therefore turn otherwise valid preparation/search work into a technical retry.
   - Fix: activity writes are now best-effort observability. Persisted job state remains authoritative.

4. **Expansion order was only four passes**
   - Previous order: PRIMARY → buyer language → adjacent sectors → broader geography/size.
   - Fix: six evidence-preserving angles are now explicit:
     1. EXACT_INDUSTRY
     2. ADJACENT_INDUSTRIES
     3. OPERATIONAL_SIMILARITY
     4. PROBLEM_SIMILARITY
     5. BUYER_SIMILARITY
     6. COMPANY_ECOSYSTEM
   - `max_expansion_passes` default and existing lower values are raised to 6.

## State-machine / lease audit

- Final Company Discovery claim function in `0061` correctly claims due `QUEUED` and `FAILED_RETRYABLE` rows, prioritises due technical retries, clears stale ownership, and establishes a new lease.
- Final recovery function in `0061` preserves the interrupted Company Discovery phase in diagnostics and releases stale leases.
- `0062` normalises queued/retry ownership fields again during migration so due work cannot remain attached to an old scheduler run.
- The historical migrations still contain old state strings/functions, but later migrations override their effective function definitions. They are migration history, not runtime branches.
- `prepare_pipeline_work()` still contains an older duplicate expired-lease recovery block. In the current scheduler order it is dormant because `recover_pipeline_jobs()` runs first. It should be removed in a later migration cleanup, but it is not the first-search retry root cause and was not rewritten here to avoid destabilising the large scheduler preparation function immediately before G4 freeze.

## Refresh audit

The campaign ticker snapshot already watches:
- status
- job state
- stage
- progress
- recommendations saved
- retry time
- next attempt
- attempt count
- error code
- `updated_at`
- company count
- recent activity IDs/timestamps

The status endpoint is `no-store`, polling is 2s while active and 1.5s while retrying, and `router.refresh()` fires when the persisted snapshot changes or a retry becomes due. Claim, progress, save, expansion, retry and finalisation paths all update `updated_at`; the corrected progress RPC also renews heartbeat/lease. This means worker start, stage transitions, saves, retries, expansion and finish all produce a refresh-visible version change.

## Important remaining architecture gap before G4 freeze

The requested streaming hand-off is **not yet true in the supplied architecture**:

- `runPipelineScheduler()` awaits Company Discovery before synchronising contact foundations and running Route Intelligence.
- Contact discovery/route claims require `companies.review_status='APPROVED'`.
- Therefore a newly verified company does not immediately begin Route Intelligence while Company Discovery is still running.

This is separate from the first-search retry defect. A genuine streaming implementation needs a deliberate orchestration change (and a decision about automatic company approval/autonomy policy), not another retry patch.

## Validation

Passed locally without external dependencies:
- `genesis:g4-orchestration-root-cause-check`
- `genesis:g4-deterministic-plan-check`
- `genesis:g4-search-order-check`
- `genesis:g4-discovery-state-check`
- `genesis:g4-legacy-audit-check`

A full TypeScript/build run could not be completed in the audit container because the ZIP correctly excludes `node_modules` and the configured package mirror returned 404 for `zod@3.24.2`. The targeted source validators passed.

## Freeze gate

Do **not** call G4 frozen solely from static validation. After applying migration 0062, run one clean production journey and confirm:

Website → Business DNA → Campaign → PREPARING → PLANNING → SEARCHING → VERIFYING → SAVING/EXPANDING → READY, with no technical retry before the first search.

Then separately implement/verify the streaming Route Intelligence hand-off before using the stricter end-to-end success criterion in the handover.

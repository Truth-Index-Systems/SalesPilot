# Genesis G4.7.10 — Full Pipeline Legacy / Leak Audit

## Scope

Full runtime audit of the latest G4.7.9 codebase, covering Business Discovery, Campaign persistence, Company Discovery, Route Intelligence, Opportunity Intelligence, Engagement, Replies/learning surfaces, scheduler orchestration, database persistence boundaries and runtime-only legacy modules.

The audit deliberately does **not** modify frozen Company Discovery commercial logic: search planning, six-pass search order, evidence verifier, confidence thresholds and company scoring are unchanged.

## Critical findings fixed

### 1. Autonomous worker ownership was inconsistent across stages

Route Intelligence had scheduler-run fencing, but Company Discovery and the three Engagement AI workers still allowed important mutations using only a row/job id. A late worker could therefore mutate work already reclaimed by a newer scheduler cycle.

**Fix:** migration `0072` introduces active scheduler ownership assertions and fenced claims/mutations. Runtime code now calls only the fenced worker RPCs. Old unfenced worker entry points have `service_role` execution revoked so future code cannot accidentally regress to them.

Covered workers:
- Company Discovery claim/progress/activity/save/finalise/failure
- Route Intelligence claim/progress/save/readiness/finalise/failure
- Commercial Reasoning claim/complete/failure
- Outreach Generation claim/complete/failure
- AI Self Review claim/complete/failure
- Engagement pipeline-stage writes

### 2. Route ownership detection in TypeScript was incomplete

`DatabaseRequestError.message` is always `DATABASE_REQUEST_FAILED`; the PostgreSQL ownership message lives in `error.details.message`. The old helper therefore failed to recognise some superseded Route Intelligence workers.

**Fix:** shared `lib/pipeline/ownership.ts` examines both the wrapped database error and its safe PostgREST details. Superseded workers now discard stale results rather than creating retries/failures.

### 3. Business Discovery could be reclaimed without per-attempt fencing

Business analysis used the public access token as both authentication and execution identity. A lease-expired attempt and a newer retry could therefore target the same job.

**Fix:** `business_analysis_jobs.worker_token` is generated on every claim. Progress, completion and failure require the current worker token and `RUNNING` state. A stale attempt is harmless.

### 4. Route recovery still used the historical G3 attempt ceiling

`recover_pipeline_jobs()` terminalised Route Intelligence after five attempts while the effective G4 route claimant permits eight attempts.

**Fix:** recovery now uses five attempts for Company Discovery and eight for Route Intelligence, with canonical `job_state`, retry timestamps and lease fields updated together.

### 5. G4.7 route readiness still accepted legacy contacts/channels

The effective readiness function used `greatest(commercial_route_count, legacy_contact_channel_count)`. An email/contact row from the pre-G4.7 model could therefore satisfy the new route-readiness gate without a proper commercial route graph.

**Fix:** readiness is now based only on persisted viable `commercial_routes`. Historical contacts and channels remain research/evidence inputs but cannot make the route READY.

### 6. Opportunity Intelligence still leaked the old G4.3 route scorer

The scheduler intentionally still runs the deterministic v2 scorer to calculate company/commercial components. However, that scorer can set `READY` from a legacy contact/channel. If no G4.7 `commercial_route` exists, the later route-aware scorer has no row with which to overwrite the incorrect status.

**Fix:** `enforce_opportunity_route_readiness()` runs after scoring. If Route Intelligence is not `READY`, opportunity status is forced to `BUILDING` (or `NEEDS_CONTACT` when exhausted), route quality/confidence are non-actionable, and the current recommended action says to continue Route Intelligence. Human `REJECTED` / already `ENGAGED` outcomes remain authoritative.

### 7. Engagement worker claims and stage writes trusted historical scheduler-run rows

The original G4 engagement claims checked that a `pipeline_scheduler_runs` record existed, not that the run still owned the live global scheduler lease. Pipeline-stage timeline writes had the same weakness.

**Fix:** all Engagement AI claims and stage mutations now require the active global scheduler lease. Completion/failure additionally require that the claimed analysis/draft/review still belongs to that run.

### 8. Deterministic engagement stages had a weaker scheduler contract than discovery

Builder, strategy, learning guidance, failure reconciliation, send-queue building and learning building accepted a scheduler id without consistently proving current ownership.

**Fix:** active-lease wrappers now cover each deterministic engagement scheduler entrypoint. Runtime callers use only the wrappers.

### 9. Dispatch planning and scheduler outcome persistence were not fenced

`plan_contact_discovery_dispatch()` and `record_pipeline_scheduler_outcome()` accepted a run id but did not prove the run still held the lease.

**Fix:** owned wrappers now enforce the active lease. The underlying historical functions are implementation-only to the SECURITY DEFINER wrappers.

### 10. PostgreSQL control-character defence was stage-specific

Business Discovery had a NUL (`U+0000`) JSON sanitiser after a real production failure, but other AI/web persistence paths did not inherit that protection.

**Fix:** `databaseRequest()` now recursively sanitises every JSON PostgREST request body at the shared database boundary. Stage-specific Business sanitisation remains as defence in depth.

## High-value cleanup

### Canonical campaign status

`lib/domain/campaign.ts` still advertised historical transient values such as `ANALYSING`, `DISCOVERING`, `QUALIFYING`, `ENRICHING`, `AWAITING_APPROVAL`, `ACTIVE` and `COMPLETED`, despite persisted campaign status now being `DRAFT | PREPARING | READY | PAUSED | FAILED | ARCHIVED`.

The domain definition now matches the effective persistence contract.

### Dead runtime modules removed

The following unreferenced legacy runtime files were removed:
- `lib/data/mock.ts`
- `lib/pipeline/campaign-state.ts`
- `lib/pipeline/retry.ts`
- `lib/pipeline/heartbeat.ts`

The active application had no imports of these files. Old release-specific validation scripts that describe historical Genesis snapshots should not be treated as the current release gate.

## Scheduler audit

Current scheduler guarantees after this pass:

1. one active global scheduler owner;
2. 300-second ownership lease aligned to the Vercel hard invocation window;
3. 275-second working budget with a persistence/release reserve;
4. approved Route Intelligence work outranks speculative Company Discovery replenishment;
5. no second heavyweight Company/Route worker is chained into the same invocation;
6. Engagement AI work only starts when its own execution budget remains;
7. stale workers cannot persist results after ownership changes.

## Stage status after audit

### Business Discovery
Hardened. Structured-output boundary, NUL sanitation, per-attempt worker token and invisible safe retry are all in place.

### Campaign Generation / persistence
No active legacy orchestration path found. Canonical campaign-status type cleaned up.

### Company Discovery
Frozen commercial engine preserved. Runtime claim/mutation ownership is now fenced and recovery has one canonical authority.

### Company Review
No duplicate review authority found. Human review remains explicit and tenant-scoped.

### Route Intelligence
G4.7 commercial routes are now the sole readiness authority. Legacy contacts/channels cannot unlock completion.

### Opportunity Intelligence
Route-readiness is enforced after all scoring, closing the remaining G4.3 readiness leak. Existing server-side approval gate remains in force.

### Engagement
All autonomous AI workers and deterministic scheduler stages are now active-lease fenced. Stale execution cannot overwrite a newer worker.

### Replies
There is **no autonomous Reply Intelligence worker in this ZIP yet**. Current code contains reply policy / outcome / learning hooks and UI surfaces, but no hidden legacy reply worker was found. G5 can therefore be introduced on a clean orchestration boundary rather than competing with an old runtime path.

### Learning / Pipeline
Current learning builder is deterministic and now scheduler-lease fenced. Mock reply/dashboard data was removed from runtime source.

## Validation

Current release gates passed after the hardening:
- G4 Company Discovery state-machine check
- G4 legacy-leak audit
- G4 orchestration root-cause check
- G4.7 Route Intelligence check
- G4.7.3 Business boundary check
- G4.7.4 scheduler-budget check
- G4.7.5 ownership-fencing check (updated to the 300-second lease)
- G4.7.6 Opportunity readiness check
- G4.7.7 PostgreSQL JSON boundary check
- G4.7.8 Route dispatch fairness check
- G4.7.9 Company Discovery freeze check
- **G4.7.10 full-pipeline legacy/leak audit**

A dependency-complete `next build` cannot be executed from this ZIP because `node_modules` is not included. Global TypeScript parsing found no syntax-class errors in the modified files; project-wide type output is dominated by unavailable Next/React/Zod/Node declarations in the extracted environment.

## Deployment

Run migration:

`0072_genesis_g4710_full_pipeline_legacy_leak_hardening.sql`

Then deploy the G4.7.10 application build.

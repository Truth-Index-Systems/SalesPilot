# S2 — Single Pipeline Scheduler

Status: implemented.

## Runtime ownership introduced

`/api/autonomy/pipeline/run` now delegates to `lib/pipeline/scheduler.ts`.
The scheduler:

1. acquires one database-backed lease;
2. recovers expired company and contact worker leases;
3. inspects active campaigns under the scheduler lease;
4. creates only missing initial company/contact work;
5. evaluates company top-up eligibility once per campaign;
6. dispatches at most one company job and one contact job sequentially;
7. releases the scheduler lease.

Concurrent cron invocations return `SCHEDULER_ALREADY_RUNNING` and do not
prepare or claim work.

## Boundaries retained for staged migration

S2 deliberately does not yet remove legacy SQL triggers. Initial campaign and
company-approval triggers remain idempotent compatibility paths until S4. The
scheduler is now the only scheduled conductor, while S3 makes workers pure and
S4 removes the competing trigger ownership.

## New persistence

- `pipeline_scheduler_lease`: singleton runtime lease.
- `pipeline_scheduler_runs`: scheduler execution audit records.
- `acquire_pipeline_scheduler_lease` RPC.
- `prepare_pipeline_work` RPC.
- `release_pipeline_scheduler_lease` RPC.

## Invariants

- Only one scheduler cycle may be active.
- Work preparation requires ownership of the current lease.
- A scheduler cycle creates no duplicate company or contact aggregate session.
- Existing queued work is retained rather than reset.
- Failed jobs remain owned by their retry schedule.
- Worker dispatch is bounded and sequential during stabilisation.

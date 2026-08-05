# Genesis Stabilisation S3 — Pure Worker Executors

## Purpose

S3 removes worker ownership of orchestration. Company and contact discovery now
run only when dispatched by the single pipeline scheduler introduced in S2.

## Worker contract

A worker may:

1. atomically claim one already-eligible job;
2. load the persisted campaign/company context;
3. perform research;
4. validate and persist supported results;
5. persist one explicit completion or failure outcome.

A worker may not:

- create a company discovery cycle;
- queue contact discovery;
- reopen itself;
- evaluate queue top-up eligibility;
- advance a campaign stage;
- mark a campaign ready for outreach;
- dispatch another worker.

## Dispatch boundary

`/api/autonomy/pipeline/run` is the only production dispatch route.

The legacy standalone routes remain as explicit `409
PIPELINE_SCHEDULER_REQUIRED` tombstones so stale Vercel cron configuration or a
manual request cannot compete with scheduler ownership.

## Explicit outcomes

Both executors now return the shared `WorkerExecutionResult` contract:

- `NO_JOB`
- `COMPLETED_WITH_RESULTS`
- `COMPLETED_NO_RESULTS`

Failures remain persisted by the existing failure RPC and are returned to the
scheduler as settled failures. Retry eligibility remains a scheduler concern.

## Transitional database boundary

S3 does not yet delete legacy SQL triggers and queue functions. That removal is
S4. The application workers no longer call any queue, top-up, downstream-stage,
or outreach-readiness function.

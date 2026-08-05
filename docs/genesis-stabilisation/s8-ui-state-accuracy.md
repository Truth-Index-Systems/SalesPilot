# Genesis Stabilisation S8 — UI State Accuracy

## Objective

Every customer-facing pipeline label must come from persisted truth. The UI must not describe queued, retrying, paused, exhausted or failed work as actively researching.

## Persisted truth rules

- `RUNNING` is the only state that may show active research, a pulsing indicator, or percentage progress.
- `QUEUED` is shown as queued and waiting for a worker.
- `FAILED_RETRYABLE` is shown as retry scheduled, including the persisted retry time where available.
- `PAUSED` is shown as paused.
- `NO_RESULTS` and `EXHAUSTED` are valid completed outcomes and never generic failures.
- `FAILED_TERMINAL` is shown as needing attention.
- Historical `status` remains a compatibility fallback only; canonical `job_state` wins whenever present.

## Changes

- Added `lib/pipeline/presentation.ts` as the shared state-presentation boundary.
- Company, contact, campaign and internal diagnostic views now use canonical job state.
- Progress bars render only for persisted `RUNNING` jobs.
- Queued and retrying contact jobs are no longer counted as researching.
- Company cards distinguish queued, running, retry scheduled, no-results and completed contact research.
- Business-analysis progress no longer uses synthetic percentages.
- Campaign stage is derived through the canonical campaign-state contract.
- Immediately repeated timeline entries are suppressed in the presentation layer without hiding legitimate later discovery cycles.

## Runtime ownership

S8 changes presentation only. It does not create work, retry jobs, advance campaigns, or alter scheduler ownership.

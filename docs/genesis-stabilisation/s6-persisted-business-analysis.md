# Genesis Stabilisation S6 — Persisted Business Analysis

Website analysis is no longer held only inside one browser/API request.

## Lifecycle

`QUEUED → RUNNING → COMPLETED`

Alternative outcomes are `FAILED_RETRYABLE`, `FAILED_TERMINAL`, and `CANCELLED`.

The browser first creates a persisted job and stores a short-lived opaque access token locally. It then asks the worker endpoint to execute the job and polls the persisted status. Refreshing the campaign wizard resumes the saved job instead of discarding it.

## Truthful stages

- `QUEUED`
- `READING_WEBSITE`
- `ANALYSING_BUSINESS`
- `PREPARING_RECOMMENDATIONS`
- `COMPLETE`
- `FAILED`

Progress shown by the UI is persisted worker progress rather than a timer-generated estimate.

## Recovery

A worker claim has a four-minute lease. An interrupted request can be reclaimed only after lease expiry. Retryable failures use persisted backoff and terminal configuration/authentication errors do not loop.

## Boundaries

The job's opaque token is stored only as a SHA-256 hash in the database. Authenticated organisation ownership is recorded where available, but the pre-launch analysis flow can still be resumed before campaign persistence.

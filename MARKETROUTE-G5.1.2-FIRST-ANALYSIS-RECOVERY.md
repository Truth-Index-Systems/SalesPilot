# MarketRoute Genesis G5.1.2 — First Analysis Recovery

## Defect
A transient failure on the first Business Analysis worker attempt placed the persisted job in `FAILED_RETRYABLE`. The inherited retry policy delayed the first retry for one minute, exposing “Analysis retry scheduled” at 0% and making the first click appear ineffective.

## Fix
- First retry: 5 seconds.
- Second retry: 15 seconds.
- Third retry: 1 minute.
- Fourth retry: 5 minutes.
- Retry remains on the same persisted analysis job, so it does not create or charge another anonymous analysis.
- Internal `QUEUED` / `FAILED_RETRYABLE` wording is no longer exposed in the campaign wizard; the visitor sees a continuous “MarketRoute is learning your business” state.
- Ownership fencing and terminal-failure limits remain unchanged (maximum five worker attempts).

## Deployment
Apply migration `0097_marketroute_g512_business_analysis_first_attempt_recovery.sql` to Supabase before or with deployment.

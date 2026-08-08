# MarketRoute Genesis G5.1.3 — First Analysis Resume Hotfix

## Root cause
Business Analysis uses resumable OpenAI background responses. When the provider response is still pending, the worker intentionally defers the persisted Business Analysis job back to `QUEUED` with a short `next_retry_at`. The browser monitor only redispatched `FAILED_RETRYABLE` jobs inside its polling loop. A deferred `QUEUED` job therefore remained visible and persisted, but was never woken again by the browser to consume the response cached by the dedicated collector.

## Fix
- `CampaignWizard.monitorAnalysisJob` now treats due `QUEUED` jobs as resumable work and redispatches the same saved job/access token.
- `FAILED_RETRYABLE` behaviour and the existing five-attempt safety boundary are unchanged.
- No additional complimentary analysis is consumed because no new Business Analysis job is created.
- Added `public/salespilot-logo.png` as a compatibility alias of the MarketRoute wordmark. No application code references the legacy path; it exists only so cached crawlers/old optimizer URLs return a valid image instead of `INVALID_IMAGE_OPTIMIZE_REQUEST`.
- The dedicated `/api/autonomy/ai/collect` recovery cron remains the owner of provider polling.

## Database
No new migration is required for G5.1.3. Keep migration `0097_marketroute_g512_business_analysis_first_attempt_recovery.sql` applied from G5.1.2.

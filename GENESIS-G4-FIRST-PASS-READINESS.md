# Genesis G4 First-Pass Readiness

- Separates first-pass preparation from genuine retries.
- Initial queued discovery uses `next_attempt_at` only.
- Retry timing is reserved for `FAILED_RETRYABLE` jobs after a real attempt.
- Normalises active untouched sessions that contain stale retry timestamps.
- Customer UI shows `Preparing company discovery` before attempt one.
- The UI explicitly states that no retry has occurred during preparation.

# Genesis Stabilisation S5 — Retry, Lease and Recovery

S5 makes failure handling deterministic without changing the customer-facing G3 workflow.

## Runtime ownership

The scheduler acquires one run ID, recovers expired leases, prepares eligible work, and passes the run ID into each pure executor. Every claimed job stores that scheduler run ID.

## Retry policy

Retryable failures use persisted backoff: 1 minute, 5 minutes, 30 minutes, 2 hours, then terminal after the fifth attempt. Rate limits wait at least five minutes. Configuration and authentication failures are terminal until corrected.

No-result outcomes are not failures. Existing company-discovery cooldown rules remain responsible for widening a completed empty search later.

## Lease recovery

Each claim receives an eight-minute lease. Progress updates act as heartbeats. At the start of each scheduler cycle, expired RUNNING jobs become FAILED_RETRYABLE or FAILED_TERMINAL depending on attempt count. Progress resets to zero so the UI cannot remain falsely stuck.

## Diagnostics

Discovery sessions now retain canonical job state, claim time, heartbeat, scheduler run, error code/message, retry time, and result summary. Scheduler runs retain recovered-job counts and executor outcomes.

## Autonomy policy foundation

`campaign_autonomy_policies` is introduced for future product tiers. Every campaign defaults to manual company review, manual contact review, manual outreach approval, suggested replies, and market learning disabled. S5 does not activate auto-approval, sending, or reply automation.

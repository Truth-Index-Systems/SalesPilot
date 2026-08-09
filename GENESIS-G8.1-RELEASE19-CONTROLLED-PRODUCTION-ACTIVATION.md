# Genesis G8.1 Release 19 — Controlled Production Activation

R19 makes the R15 Knowledge merge a controlled production path rather than an always-on acceleration. The migration defaults activation to level 0 (off). Founder controls can move the system through allowlist, 10%, 25%, 50%, and 100% deterministic campaign cohorts without deployment.

The controller preserves Discovery Intelligence as the fail-open safety path. Candidate Truth, confidence, coverage, and blocking state are checked before activation. Recent production fallback, merge failure, repair burden, and human rejection signals can automatically reduce the effective activation level by one step even when the configured founder level is higher.

Activation telemetry is append-only and is used only for rollout safety; it never changes MR-TI-1.0. R19 adds no cron or new AI executor.

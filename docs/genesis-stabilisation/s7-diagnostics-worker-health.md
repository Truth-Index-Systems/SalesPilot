# S7 — Diagnostics and Worker Health

## Purpose

S7 adds a single internal page for diagnosing autonomous pipeline behaviour without inferring state from campaign timelines.

## Route

`/internal/autonomy`

Only organisation `OWNER` and `ADMIN` roles can access it. Data is scoped to the active organisation. Scheduler metadata is global but contains no customer campaign payloads.

## Authoritative signals

- Scheduler lease and latest run
- Preparation decision and worker outcomes
- Active, queued and retryable jobs
- Last heartbeat and lease expiry
- Attempts and next retry
- Structured failure reason
- Result summary

The page refreshes every 15 seconds and is read-only. It does not mutate or repair pipeline state; S5 recovery remains the owner of automatic repair.

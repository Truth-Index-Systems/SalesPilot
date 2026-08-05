# S7.1 — AI Governance and Cost Control

Every OpenAI request now requires two independent gates:

1. Deployment gate: `SALESPILOT_AI_PLATFORM_ENABLED=true`.
2. Workspace policy: autonomy explicitly enabled by an OWNER or ADMIN.

The database atomically reserves each request before network dispatch and blocks it when workspace request, campaign request, or estimated daily cost limits are reached. Every success, failure and blocked attempt is written to `ai_usage_ledger`.

## Safe defaults

- Workspace autonomy: disabled.
- Workspace requests: 25/day.
- Campaign requests: 10/day.
- Estimated workspace budget: $5/day.
- Scheduler dispatch remains bounded to one company and one contact worker per run.

Cost rates are configurable with:

- `SALESPILOT_AI_INPUT_USD_PER_MILLION`
- `SALESPILOT_AI_OUTPUT_USD_PER_MILLION`
- `SALESPILOT_AI_WEB_SEARCH_USD_PER_CALL`
- Per-job estimated reservation variables documented in `lib/ai/governance.ts` call sites.

The internal autonomy page contains an emergency stop and the authoritative daily ledger.

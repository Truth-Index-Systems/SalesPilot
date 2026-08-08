# MarketRoute Genesis G5.1.10 — Background Incomplete Recovery & Ledger Closure

Production evidence showed Growth Strategy reaching 72%, with OpenAI returning a durable background response whose provider status was `incomplete`. The response checkpoint became terminal, but its `ai_usage_ledger` row remained `RESERVED`, the provider incomplete reason was discarded, and retries shared the same deterministic request identity.

This patch makes terminal provider responses first-class durable outcomes:

- collector persists `incomplete_details.reason` / provider errors into `collector_last_error`;
- terminal background responses close their ledger row as `FAILED`, releasing in-flight capacity;
- terminal JSON is used to preserve token diagnostics without exposing it as a completed result;
- webhook-signalled terminal responses are eligible for one recovery collection so provider details can be captured;
- terminal checkpoints are retained as immutable retry history rather than deleted;
- Business Analysis walks a deterministic retry chain derived from terminal response IDs, so refresh/resume finds the same newest attempt and never duplicates pending provider work;
- each fresh provider retry gets a distinct governance request key / ledger row;
- Growth Strategy output allowance is raised from 3,800 to 6,500 tokens by default (bounded by the existing workload profile) because GPT-5 reasoning and structured output share the allowance. Override with `MARKETROUTE_BUSINESS_ANALYSIS_GROWTH_MAX_OUTPUT_TOKENS` if required.

Apply migration `0103_marketroute_g5110_background_incomplete_recovery.sql` before deployment or at the same release boundary.

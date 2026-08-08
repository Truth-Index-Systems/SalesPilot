# MarketRoute Genesis — Speed R5: Latency Observatory & Hardening

## Purpose

R5 completes the planned speed programme by making the R1–R4 background architecture measurable and self-repairing. It does not change G4/G5 commercial authority, executive prompts, reasoning budgets, or deterministic validators.

## What changed

### Durable lifecycle telemetry
`ai_background_responses` now records:
- `submitted_at`
- `provider_completed_at`
- `collected_at`
- `owner_woken_at`

`ai_usage_ledger` now records:
- `cached_input_tokens`
- `reasoning_tokens`
- `validated_at`
- `persisted_at`

The existing created/completed timestamps remain authoritative for queue and ledger history.

### Latency observatory
The internal AI Cost Baseline now includes an R5 latency observatory with:
- p50 / p90 / p95 end-to-end latency by executive
- provider p50
- collector p50
- background pending/stale counts
- prompt-cache hit rate
- cached input tokens
- reasoning tokens
- collector recovery retries
- workspace-scoped recovery errors

### Webhook race reconciliation
If an OpenAI terminal webhook arrives before the background checkpoint has been persisted, R5 adopts that previously unmatched event during checkpoint upsert, marks it matched, and wakes the owning MarketRoute job.

### Stale/orphan recovery
The recovery collector now runs `repair_ai_background_observability()` before collection. It:
- reconciles unmatched webhook events that can now be linked to checkpoints
- releases expired collector leases
- classifies stale RESERVED ledger entries with no durable response id/checkpoint after 30 minutes as `ORPHANED_RESERVATION_NO_RESPONSE_ID`

This repair creates no provider work.

### Collection fairness and speed
Collection claims are ranked per organisation/campaign before filling the collector batch so a busy campaign cannot monopolise recovery capacity. Claimed provider GETs are performed concurrently with `Promise.all`; no POST/submission path exists in the collector.

### Token telemetry
Provider-reported `input_tokens_details.cached_tokens` and `output_tokens_details.reasoning_tokens` are extracted and persisted. Cost calculation behaviour is unchanged in R5; these values are observability inputs for later pricing/tuning decisions.

## Deployment

Apply:

`supabase/migrations/0096_genesis_speed_r5_latency_observatory_hardening.sql`

No new mandatory environment variables are required.

Existing R2 requirements remain:
- `OPENAI_WEBHOOK_SECRET`
- OpenAI Responses webhook configuration
- collector cron

## Validation

- Speed R5: 21/21 PASS
- Speed R4: 18/18 PASS
- Speed R3: 18/18 PASS
- Speed R2: 18/18 PASS
- Speed R1: PASS
- All-AI background resumability: 36/36 PASS

A fresh Next.js compile was not run in the packaging environment because this source ZIP does not include `node_modules`. Vercel/npm dependency installation remains the final dependency-backed build check.

## R1–R5 outcome

- R1: model duration is not treated as a serverless timeout failure.
- R2: webhook-first completion; polling is recovery.
- R3: bounded parallel dispatch.
- R4: smaller/faster AI workloads and deterministic fast paths.
- R5: measurable latency, cache/reasoning telemetry, fair recovery, race/orphan hardening.

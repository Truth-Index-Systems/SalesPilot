# Genesis Post-Freeze — GPT-5 Transport Timeout & Retry Hardening

## Purpose
Harden the production scheduler for slower/full GPT-5 inference without changing any executive prompt, evidence standard, G4/G5 state authority or commercial judgement.

## Changes
- Central task-aware OpenAI request timeout policy with env overrides.
- Explicit TIMEOUT vs NETWORK normalization at active AI transport boundaries.
- Company Discovery transient retry backoff: 30s -> 60s -> 2m, then terminal attention.
- HTTP 408/425/5xx/529 service failures classified as retryable transport failures.
- A G4 heavyweight attempt owns the cron's heavyweight slot even if it times out; G5 AI is not chained into the same invocation afterward.
- Structured-output repair gets its own bounded timeout.

## Default timeout envelopes
- Business Analysis: 150s
- Company Discovery: 180s
- Route Intelligence first pass: 180s
- Route Intelligence expansion: 150s
- G5 Commercial Reasoning: 120s
- G5 Channel Strategy: 90s
- G5 Outreach Generation: 75s
- G5 Self Review: 120s
- Structured JSON repair: 45s

All are configurable via SALESPILOT_AI_TIMEOUT_*_MS env vars and clamped to 15s..240s.

## Migration
Apply `0091_genesis_post_freeze_gpt5_transport_timeout_retry_hardening.sql`.

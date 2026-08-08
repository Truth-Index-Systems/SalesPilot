# MarketRoute Genesis — Speed R2: Event-Driven AI Completion

## Goal

No pipeline worker polls or waits on OpenAI reasoning. Workers submit resumable background Responses API work and release ownership. OpenAI webhook events are the primary completion signal. A dedicated collector retrieves finished responses and polling remains a recovery path for missed/delayed webhooks.

## Architecture

```text
PIPELINE DISPATCHER
claim eligible stage
  -> submit background=true/store=true
  -> persist response_id
  -> release stage lease
  -> return

OPENAI
  -> reasoning continues remotely
  -> response.completed / failed / cancelled / incomplete webhook

WEBHOOK INGESTION
verify signature + replay window
  -> idempotently persist event_id
  -> mark checkpoint provider status
  -> wake owning MarketRoute job immediately
  -> on completed, opportunistically retrieve/cache final Response
  -> return

BACKGROUND COLLECTOR
separate CRON-protected route
  -> claim checkpoint collection leases
  -> retrieve completed/stale provider responses
  -> cache completed response_json
  -> wake owner

PIPELINE DISPATCHER (next eligible claim)
  -> consumes cached response_json
  -> existing deterministic validation/state commit
```

## New production endpoint

`POST /api/openai/webhook`

Configure an OpenAI project webhook to this public HTTPS endpoint and subscribe to:

- `response.completed`
- `response.failed`
- `response.cancelled`
- `response.incomplete`

Set the resulting signing secret as:

`OPENAI_WEBHOOK_SECRET`

The route verifies the unparsed request body against `webhook-id`, `webhook-timestamp`, and `webhook-signature`, with a five-minute replay tolerance.

## Recovery collector

`GET|POST /api/autonomy/ai/collect`

- protected with the existing `CRON_SECRET`
- scheduled every minute in `vercel.json`
- owns provider GET/polling
- never submits new AI work
- uses independent collection leases
- prioritises webhook-signalled completed responses
- polls stale queued/in-progress responses if a webhook was missed

## Database migration

Run:

`supabase/migrations/0094_genesis_speed_r2_event_driven_ai_completion.sql`

It adds:

- provider event metadata to `ai_background_responses`
- collector lease/diagnostic fields
- terminal provider states (`failed`, `cancelled`, `incomplete`)
- idempotent `openai_webhook_events`
- webhook ingestion RPC
- background collector claim/cache/release RPCs
- owner wake-up RPC

All new tables/RPCs remain service-role-only.

## Frozen boundaries preserved

- no G4 commercial intelligence logic changed
- no G5 reasoning/channel/outreach/self-review decision logic changed
- no schema/output contracts changed
- no deterministic scoring authority moved
- no new model call introduced
- polling moved from stage workers to the collector only

## Validation

- `npm run speed:r2-check` — 18/18 PASS
- `npm run speed:r1-check` — PASS
- `npm run all-ai:background-resumability-check` — 36/36 PASS

A full `next build` still requires the project dependencies to be available. This workspace's npm mirror previously failed to resolve the locked `zod@3.24.2`; no production dependency versions were changed by R2.

## Next release

Speed R3 — Controlled Parallel Execution.

R2 makes waiting event-driven and non-blocking. R3 can now safely allow multiple independent company/route executions to be in-flight while retaining organisation/campaign caps and one state-changing G5 executive per opportunity.

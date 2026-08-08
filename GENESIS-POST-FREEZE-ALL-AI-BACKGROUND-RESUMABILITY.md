# Genesis Post-Freeze — All-AI Background Resumability

## Objective
Make every active MarketRoute AI executive safe for long-running full GPT-5 inference without requiring the model response to finish inside one Vercel/serverless invocation.

## Active stages covered
- Business Understanding / Chief Commercial Strategy Officer
- Company Discovery / VP Market Intelligence
- Route Intelligence / VP Account Mapping & Buying Committees
- G5 Commercial Reasoning / CRO Deal Strategist
- G5 Channel Strategy / VP Sales Development
- G5 Outreach Generation / Executive Communications Director
- G5 Self Review / Chief Revenue Risk & Quality Officer

R5 Personalisation Safety and R7 Engagement Quality remain deterministic and make no model calls. Frozen legacy G4 engagement AI remains scheduler-disabled.

## Architecture
Each active model request now uses OpenAI Responses background mode. MarketRoute persists the provider response ID in `ai_background_responses`. If the response is `queued` or `in_progress`, the owning MarketRoute job releases its lease without consuming an attempt and returns to its safe pre-AI state. A later scheduler/API invocation polls the same response ID. No duplicate model call is created.

A completed provider response is persisted as a checkpoint before stage-local parsing/persistence. If downstream database work is interrupted, MarketRoute can reuse the completed provider response without paying for the model work again. If structured output is invalid, the checkpoint is deliberately discarded so the owning governed stage can request a fresh result.

## Governance
Polling existing RESERVED/SUCCEEDED provider work does not consume a new request and is allowed even if the workspace subsequently reaches its request/cost allowance or the platform gate is paused. A new provider submission still requires the normal AI governance reservation.

## Scheduler behaviour
A background-pending/DEFERRED G5 stage counts as having occupied the single AI slot for that scheduler invocation. MarketRoute will not silently start the next G5 executive merely because the current executive released its lease while OpenAI continues thinking.

## Structured output
Automatic ungoverned model repair is disabled by default. Deterministic JSON repair remains available; if strict output is still invalid, the owning stage retries through the normal governed/resumable path.

## Migration
Apply `0093_genesis_post_freeze_all_ai_background_resumability.sql`.

## Optional environment tuning
- `SALESPILOT_AI_BACKGROUND_SUBMIT_TIMEOUT_MS` default 30000
- `SALESPILOT_AI_BACKGROUND_POLL_TIMEOUT_MS` default 20000

These control only the short create/poll HTTP calls, not the duration of GPT-5 reasoning itself.

## Validation
- 36/36 all-AI background-resumability invariants passed
- 29/29 Company Discovery decomposition invariants passed
- 12/12 GPT-5 timeout/retry invariants passed
- 64/64 responsibility-boundary invariants passed
- 30/30 executive-prompt invariants passed
- 19 modified TypeScript files passed syntax transpilation

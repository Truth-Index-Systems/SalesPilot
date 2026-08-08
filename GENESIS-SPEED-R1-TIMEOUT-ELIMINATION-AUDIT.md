# Genesis Speed R1 — Timeout Elimination Audit

## Goal
No active heavyweight AI executive may fail merely because model reasoning takes longer than a serverless invocation. Active work must submit a Responses API background job, persist its response id, release stage ownership, and resume on a later scheduler claim.

## Ownership map

| Path | Classification | Provider ownership |
|---|---|---|
| `lib/intelligence/openai.ts` | BACKGROUND_RESUMABLE | `fetchResumableOpenAIResponse` |
| `lib/discovery/openai.ts` | BACKGROUND_RESUMABLE | `fetchResumableOpenAIResponse` |
| `lib/contacts/openai.ts` | BACKGROUND_RESUMABLE | `fetchResumableOpenAIResponse` |
| `lib/engagement/g5-commercial-reasoning-openai.ts` | BACKGROUND_RESUMABLE | `fetchResumableOpenAIResponse` |
| `lib/engagement/g5-channel-strategy-openai.ts` | BACKGROUND_RESUMABLE | `fetchResumableOpenAIResponse` |
| `lib/engagement/g5-outreach-generation-openai.ts` | BACKGROUND_RESUMABLE | `fetchResumableOpenAIResponse` |
| `lib/engagement/g5-self-review-openai.ts` | BACKGROUND_RESUMABLE | `fetchResumableOpenAIResponse` |
| `lib/ai/structured-response-gateway.ts` | DETERMINISTIC | mechanical JSON recovery only; no provider call |
| `lib/engagement/commercial-reasoning-openai.ts` | LEGACY / REMOVE | frozen G4 engagement path, not scheduler-driven |
| `lib/engagement/outreach-generation-openai.ts` | LEGACY / REMOVE | frozen G4 engagement path, not scheduler-driven |
| `lib/engagement/self-review-openai.ts` | LEGACY / REMOVE | frozen G4 engagement path, not scheduler-driven |
| `lib/ai/background-response.ts` | PROVIDER TRANSPORT OWNER | sole active direct `/v1/responses` transport |

## R1 changes

1. Removed the synchronous model-based structured-output repair escape hatch. Structured repair now performs only deterministic truncation recovery. If schema validation still fails, the owning stage's existing retry/dead-letter policy remains authoritative.
2. Background submissions now explicitly use `store: true` so the response object can be retrieved reliably by id after the submitting invocation has returned.
3. Added `speed:r1-check`, a repository invariant that fails if an active path introduces a direct Responses API call outside the background transport owner.
4. Preserved the G4→G5 frozen responsibility boundary. Legacy G4 engagement OpenAI modules remain present only for historical compatibility and are verified as outside the scheduler.

## Deliberately deferred

- Webhook completion and dispatcher/collector separation: Speed R2.
- Controlled multi-job parallelism: Speed R3.
- Per-executive reasoning/output/context budgets and prompt caching: Speed R4.
- Full latency observability and orphan recovery: Speed R5.

## Exit condition

`npm run speed:r1-check`, `npm run all-ai:background-resumability-check`, `npm run typecheck`, and `npm run build` must pass. No active heavyweight path may call `/v1/responses` directly except `lib/ai/background-response.ts`.

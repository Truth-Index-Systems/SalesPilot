# MR-TI-2 Build 8.3.5 — Expansion Dispatch Audit

Diagnostic-only release. No expansion, canonicalisation, persistence, governance or MR-TI-2 control-flow semantics are intentionally changed.

Adds structured `GENESIS_G82_EXPANSION_DECISION` logs at every important expansion decision boundary:

- `JOB_CLAIMED`
- `RESEARCH_DISPATCH`
- `AI_RESERVATION_REQUEST`
- `AI_RESERVATION_GRANTED`
- `BACKGROUND_FETCH_OR_SUBMIT`
- `BACKGROUND_PENDING`
- `BACKGROUND_TERMINAL`
- `BACKGROUND_RESPONSE_AVAILABLE`
- `PROVIDER_INCOMPLETE_RETRY`
- `HARD_GATE_ACCEPTED`
- `HARD_GATE_CANONICALISATION_REQUIRED`
- `CANONICALISATION_START`
- `CANONICALISATION_PENDING`
- `CANONICALISATION_ACCEPTED`
- `DISCARD_CHECKPOINT`
- `RESEARCH_ACCEPTED`
- `PERSIST_COMPANY_START`
- `PERSIST_COMPANY_DONE`
- `SETTLE_COMPLETED`
- `SETTLE_QUEUED`
- `SETTLE_RETRYABLE_FAILURE`
- `SETTLE_FINAL_FAILURE`

Purpose: make every early exit visible in Vercel logs so a claimed expansion job can no longer silently settle without an observable decision reason.

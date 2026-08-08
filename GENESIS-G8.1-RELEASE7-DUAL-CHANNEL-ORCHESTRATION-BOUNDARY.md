# Genesis G8.1 Release 7 — Dual-Channel Orchestration Boundary

## Purpose

R7 converts the deterministic R6 plan into idempotent execution instructions while preserving the frozen MarketRoute workers as the only future live research executors.

## Constitutional boundary

- G8 plans; existing Discovery Intelligence executes research.
- R7 contains no OpenAI, network, database, Supabase, queue, or pipeline invocation.
- Knowledge Intelligence may be used immediately only when the R6 plan permits it.
- `READY_WITH_GAPS` returns Knowledge immediately and emits non-blocking claim-level repair instructions.
- `REFRESH_REQUIRED` emits blocking claim-level repair instructions and does not expose Knowledge before refresh.
- `HUMAN_REVIEW_REQUIRED` stops at the founder review boundary.
- `NOT_USABLE`/Discovery-only produces one full Discovery instruction.
- Dispatch keys are deterministic so resumed jobs can deduplicate repeated orchestration attempts.
- Workflow references are opaque correlation only and must never enter shared Knowledge Intelligence as customer-private facts.

## New public API

`buildGenesisG8ExecutionEnvelope(plan, context)`

Produces a versioned envelope with one or more instructions:
- `KNOWLEDGE_RESULT`
- `DISCOVERY_REPAIR`
- `DISCOVERY_FULL`
- `HUMAN_REVIEW`

`validateGenesisG8ExecutionEnvelope(envelope)`

Applies fail-safe structural invariants before a later adapter is allowed to dispatch work.

## No live wiring

R7 intentionally does not import into:
- `lib/discovery`
- `lib/contacts`
- `lib/opportunities`
- `lib/pipeline`
- `lib/autonomy`

The production adapter is a later release boundary.

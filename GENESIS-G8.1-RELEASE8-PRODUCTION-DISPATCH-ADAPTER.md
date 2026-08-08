# Genesis G8.1 Release 8 — Production Dispatch Adapter

## Purpose
R8 is the first database-capable execution bridge from the deterministic R7 envelope into production-owned work boundaries. It does not replace Discovery Intelligence and does not introduce a second AI worker stack.

## What ships
- `lib/genesis-g8/production-dispatch.ts`
- migration `0110_genesis_g81_release8_production_dispatch_adapter.sql`
- idempotent production dispatch ledger keyed by R7 `dispatchKey`
- exact claim-level Discovery repair queue
- founder human-review queue
- safe full-Discovery fallback that reuses the existing campaign `discovery_sessions` state machine
- private workflow context isolated from the shared Knowledge Intelligence graph

## Dispatch behaviour
- `KNOWLEDGE_RESULT`: acknowledgement only; no research is created.
- `DISCOVERY_REPAIR`: exact repair contract is durably queued. R8 deliberately does not widen a claim repair into a whole-stage rerun.
- `DISCOVERY_FULL`: when organisation/campaign identity is supplied, the existing discovery session is created or requeued only from a terminal state. Running/queued sessions remain authoritative.
- `HUMAN_REVIEW`: creates an OPEN founder-review task without changing Truth Index.

## Safety boundary
R8 itself performs no AI calls. Existing Discovery workers remain the only research executors. Claim-level repairs are not consumed until an explicit worker-consumption adapter is added; this is deliberate fail-closed behaviour.

## Idempotency
Every instruction is first registered against its stable R7 dispatch key. A completed dispatch returns `ALREADY_DISPATCHED` on replay rather than creating duplicate work.

## Shared/private separation
Organisation, campaign, company and requesting-user IDs are operational routing context only. They are stored in the R8 dispatch domain and must never be written into organisation-neutral G8 Knowledge Intelligence entities/evidence.

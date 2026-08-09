# MR-TI-2 Build 2 — Deterministic Claim Contracts & AI Evidence Boundary

## Scope

Build 2 adds the deterministic MR-TI-2 claim contract catalogue and the equation-aware AI evidence interface. It does not activate MR-TI-2 scoring and does not modify the active TI-1 calculation path.

## Deterministic V2 claim contracts

`lib/genesis-g8/truth-v2/contracts.ts` defines 60 claims across industry, sector, company, contact, route and opportunity entities. Each V2 claim owns its proposition, impact class, relative weight, freshness half-life and permitted Matrix-2 relationship types. The V2 definitions intentionally do not reference legacy `ClaimCriticality` or TI-1 criticality semantics.

## Supabase compatibility

Migration `0129_genesis_g82_mrti2_build2_contracts_ai_boundary.sql` is additive. It creates `genesis_g8_truth_v2_contract_definitions`, populates the deterministic V2 catalogue and safely materialises V2 profiles against existing G8 claim IDs. No legacy intelligence entity/claim/evidence row is updated. A service-role-only `sync_genesis_g8_truth_v2_claim_profiles(uuid)` RPC is provided for later orchestration builds.

## AI evidence trust boundary

`lib/genesis-g8/truth-v2/ai/` defines the V2 evidence schema, strict OpenAI-compatible JSON schema, runtime validation and the equation-aware collector instructions.

The AI may return only primitive observations needed by deterministic MR-TI-2 maths: claim key/direction, evidence text/source, source class, authority, directness, traceability, timestamps, source lineage/derivative depth, and evidence-supported DEPENDS_ON / CONTRADICTS relationship hints.

The AI is explicitly forbidden from returning or calculating Truth Index, claim probability, represented confidence, coverage, foundational integrity, contradiction severity, freshness modifiers, independence modifiers or final evidence quality. Missing evidence is represented as a missing claim key, never as zero-confidence evidence.

## Active-path safety

Build 2 does not import `truth-v2` from the active G8 read model, autonomous expansion worker, discovery repair worker, or TI-1 truth kernel. Cut-over remains deferred until the deterministic V2 engine exists and passes its own regression suite.

## Validation

Run:

`npm run mr-ti2:build2-check`

The validator checks 23 invariants covering contract isolation, all 60 claims, AI primitive fields, missingness semantics, strict structured output, additive SQL, V2-only profile sync, and no active-path switch.

## Next build

Build 3: deterministic evidence-quality, freshness and independence engines using the frozen MR-TI-2 maths (`Q = weighted mean - 0.5 weighted SD`, claim-specific exponential freshness decay, and exponential shared-evidence decay), with unit tests and no active Truth cut-over.

# MR-TI-2 Extensive Legacy Code Removal Audit

Audited base: MarketRoute-Genesis-MR-TI-2-Build8.2.1-Cold-Start-Ambiguity-Hotfix(1).zip

## Executive finding

MR-TI-2 mathematics is implemented, but the application is not yet a clean MR-TI-2 system. Several production-reachable orchestration, retrieval, refresh, dashboard, contract, and review paths still depend on TI-1 tables or TI-1 semantics. The system is therefore hybrid rather than fully migrated.

## Critical production leaks

### 1. Founder command centre still reads TI-1 snapshots
`public.genesis_g8_founder_intelligence_snapshot()` (migration 0120) derives latest Truth, confidence, coverage and review state from `genesis_g8_truth_snapshots`, not `genesis_g8_truth_v2_snapshots`.

Impact: main dashboard health can remain empty/stale even while MR-TI-2 snapshots exist.

### 2. Company retrieval projection is TI-1-backed
`public.refresh_genesis_g8_company_search_projection()` (migration 0115) reads `genesis_g8_truth_snapshots`, `critical_claim_ceiling`, and TI-1 result JSON. Contact/route truth averages also use legacy snapshots. Its refresh trigger is attached to `genesis_g8_truth_snapshots`, not V2 snapshots.

`lib/genesis-g8/knowledge-candidate-retrieval.ts` maps `critical_claim_ceiling`, and `lib/genesis-g8/knowledge-matching.ts` uses it as retrieval confidence. The file still contains an explicit MR-TI-1.0 freshness comment.

Impact: candidate ranking/reuse remains partly controlled by TI-1 even after V2 activation.

### 3. Background refresh is TI-1-driven
`public.list_genesis_g8_background_refresh_candidates()` (migration 0118) reads TI-1 snapshots, legacy claim half-lives, and legacy criticality. Its priority formula uses CRITICAL/REQUIRED/SUPPORTING weights.

Impact: research scheduling can contradict MR-TI-2 impact classes and V2 freshness semantics.

### 4. Capacity budgeting measures TI-1 truth gain
Latest `public.genesis_g8_capacity_budget_snapshot()` (migration 0123) computes daily truth gain from `genesis_g8_truth_snapshots`.

Impact: background growth/capacity decisions can be based on a retired score stream.

### 5. Legacy claim contracts still create the live claim rows
`ensureGenesisG8ContractClaims()` in `lib/genesis-g8/persistence/repository.ts` calls `getIntelligenceContract()` from the old `lib/genesis-g8/contracts.ts`.

Both `discovery-acquisition-worker.ts` and `autonomous-expansion-worker.ts` upsert entities with the old contract version and ensure legacy claim definitions before adding V2 sidecars.

Impact: MR-TI-2 remains structurally dependent on TI-1-era criticality/weights/minimum-evidence metadata.

### 6. Legacy criticality still controls operational behaviour
`hydration.ts` maps V2 impact classes back into CRITICAL/REQUIRED/SUPPORTING/OPTIONAL compatibility values.

Those compatibility values are then used by:
- `gap-repair.ts` to choose HUMAN_REVIEW for contradicted CRITICAL/REQUIRED gaps.
- `founder-review-resolution.ts` to mark CRITICAL/REQUIRED repairs `BLOCKING_BEFORE_USE`.
- `claim_genesis_g8_discovery_repairs()` to prioritise queue items by legacy criticality.
- background-refresh SQL to weight refresh priority by criticality.

Impact: even with V2 Truth maths, TI-1 categorical semantics still influence execution and human-review routing.

### 7. Human review receipts still reference TI-1 snapshots
`resolve_genesis_g8_founder_review` definitions in migrations 0113/0125 select the latest `genesis_g8_truth_snapshots` ID.

Impact: review lineage/audit trails can point to an old or absent TI-1 calculation instead of the V2 state that caused the review.

### 8. Old TI-1 implementation remains reachable in source/API surface
The complete `lib/genesis-g8/truth/` calculator remains present. `lib/genesis-g8/read-model.ts` still directly calls `calculateTruthIndex()`.

`lib/genesis-g8/persistence/repository.ts` still exposes `persistGenesisG8TruthSnapshot()` and imports `TruthIndexResult` from TI-1.

`lib/genesis-g8/index.ts` still exports the old `contracts` surface and `discovery-repair-openai.ts`, even though the active repair worker uses the V2 researcher.

Impact: accidental reintroduction is easy and existing validators do not prevent it comprehensively.

## Important but transitional coupling

Several active modules import entity/source/criticality types from `./truth` or `./truth/types`. Type-only usage does not itself execute TI-1 maths, but it makes V2 dependent on the old namespace and preserves the conceptual coupling. These common types should move to a neutral shared model namespace.

## Cold-start finding

The latest `ensure_genesis_g82_expansion_backlog()` itself does not rely on TI-1 Truth. Therefore the current cold-start/backlog issue should be debugged independently. However, once jobs/entities begin flowing again, the legacy surfaces above will immediately affect dashboard, retrieval, refresh, capacity, and repair behaviour unless removed.

## Recommended removal order

1. Create neutral shared entity/evidence enums/types outside `truth/`.
2. Make V2 contracts the only source used when creating/syncing live claim rows.
3. Replace founder command-centre RPC with V2 snapshots.
4. Replace company search projection Truth columns/trigger with V2 state; remove `critical_claim_ceiling` from active ranking.
5. Rewrite background-refresh candidate RPC using V2 claim profiles, V2 half-lives/impact classes, and V2 snapshots.
6. Rewrite capacity truth-gain calculation using V2 snapshots.
7. Remove compatibility criticality from active repair/review decisions; use V2 impact class + contradiction review state + research priority.
8. Point human review receipts to V2 snapshot IDs.
9. Remove old repair OpenAI export and legacy Truth snapshot writer from active barrel/API.
10. Move TI-1 calculator/read-model/contracts into an explicit historical-only folder or delete after database rollback policy is agreed.
11. Add a hard validator that fails if production runtime/SQL references `genesis_g8_truth_snapshots`, `critical_claim_ceiling`, `calculateTruthIndex`, or legacy criticality decisions.

## Verdict

MR-TI-2 is mathematically present but production architecture is still hybrid. The highest-risk legacy leakage is in SQL/read-model infrastructure rather than the V2 calculator itself. A dedicated removal release is justified before declaring a hard MR-TI-2 production freeze.

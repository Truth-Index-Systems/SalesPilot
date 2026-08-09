# MR-TI-2 Build 1 — Legacy Audit & Additive Foundation

## Build boundary

Build 1 does **not** activate MR-TI-2 and does **not** change the production Truth result. It establishes a non-destructive database foundation and records where MR-TI-1 semantics currently live so later builds can replace the active calculation path without contaminating Supabase history.

## Existing infrastructure retained

The following existing G8 foundations are structurally reusable and remain untouched:

- `genesis_g8_intelligence_entities` — entity identity/lifecycle.
- `genesis_g8_intelligence_claims` — persisted claim identity, current contract weight and half-life.
- `genesis_g8_intelligence_evidence` — immutable/additive evidence rows and provenance.
- `genesis_g8_human_review_receipts` — immutable human decisions.
- Existing RLS/service-role boundary and entity/claim/evidence foreign keys.

## MR-TI-1 logic explicitly classified RETIRE FROM ACTIVE PATH

- `lib/genesis-g8/truth/equation.ts` — `confidence × coverage` plus `criticalClaimCeiling` hard minimum.
- `lib/genesis-g8/truth/review.ts` — `CRITICAL_CLAIM_WEAK` semantics and TI-1 thresholds.
- `lib/genesis-g8/truth/claim.ts` / `evidence.ts` — TI-1 evidence-to-claim calculation semantics.
- `lib/genesis-g8/read-model.ts` — currently calls `calculateTruthIndex()` directly and derives gaps from TI-1 claim confidence/contradiction outputs.
- `lib/genesis-g8/persistence/repository.ts::persistGenesisG8TruthSnapshot` — persists TI-1 result shape including `critical_claim_ceiling`.
- `scripts/validate-genesis-g8-truth-kernel.mjs` — intentionally asserts TI-1 formula/ceiling behaviour and must not be reused as the MR-TI-2 validator.

None of these are modified in Build 1. Keeping them byte-for-byte operational preserves rollback and proves MR-TI-2 is not partially wired before its engine exists.

## Legacy database contracts retained for history/rollback

`genesis_g8_truth_snapshots` is intentionally **not altered**. It requires a `critical_claim_ceiling` and therefore encodes MR-TI-1 semantics. MR-TI-2 must not stuff placeholder data into that column.

Likewise, existing `criticality` and legacy evidence `strength` / `independence` columns are not renamed or reinterpreted. MR-TI-2 semantics are stored beside them rather than silently changing their meaning.

## Additive MR-TI-2 foundation

Migration `0128_genesis_g82_mrti2_build1_foundation.sql` adds four sidecars:

1. `genesis_g8_truth_v2_claim_profiles`
   - MR-TI-2 `impact_class`
   - claim weight and freshness half-life as an explicit V2 contract profile

2. `genesis_g8_truth_v2_evidence_assessments`
   - authority
   - directness
   - traceability
   - source publication time
   - lineage key / derivative depth
   - raw AI observation JSON

3. `genesis_g8_truth_v2_claim_relationships`
   - Matrix 2 edges
   - `DEPENDS_ON`
   - `CONTRADICTS`

4. `genesis_g8_truth_v2_snapshots`
   - immutable V2 result history
   - Truth Index
   - represented confidence
   - coverage
   - foundational integrity
   - contradiction severity
   - review state

## Safety invariants

- No `DROP TABLE`, `DROP COLUMN`, destructive rename or legacy update/backfill.
- No existing MR-TI-1 table definition is changed.
- No active TypeScript runtime imports an MR-TI-2 module in Build 1.
- MR-TI-1 remains the active calculation path until the later cut-over build.
- MR-TI-2 sidecar tables use the same internal service-role-only boundary as the existing G8 intelligence store.
- V2 snapshots are append-only for the service role (`SELECT` + `INSERT`, no `UPDATE`/`DELETE` grant).

## Next build

Build 2 should create the deterministic MR-TI-2 claim contracts and the equation-aware AI evidence contract. It should populate these sidecars without changing the active Truth calculation.

# MR-TI-2 Build 6 — Entity Aggregation and V2 Snapshot Construction

Build 6 completes the deterministic MR-TI-2 mathematical chain after Matrix 2 without switching the live TI-1 read path.

## Added
- Weighted coverage from represented claim weight / total contract weight.
- Represented confidence from weighted adjusted claim probabilities over represented weight.
- Base truth as weighted adjusted truth mass / total contract weight.
- Foundational integrity from represented FOUNDATIONAL claims only.
- Missing foundational claims are handled by coverage and are never double-penalised as false.
- Frozen foundational modifier `1 - (1 - FI)^1.5`.
- Final `truthIndex = min(99.9, 100 * baseTruth * foundationalModifier)`.
- Entity state vector and deterministic diagnostics.
- V2 snapshot construction and append-only persistence to `genesis_g8_truth_v2_snapshots`.

## Deliberately unchanged
- TI-1 read model and active score path.
- Legacy `genesis_g8_truth_snapshots` rows and critical-ceiling history.
- Supabase schema: Build 1 already created the required V2 snapshot table, so Build 6 requires no new migration.

## Trust boundary
Build 6 consumes Matrix-2 adjusted probabilities (`P*`). It does not call AI and does not import TI-1 equation/review modules.

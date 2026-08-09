# MR-TI-2 Build 5 — Matrix 2 Relationships

Build 5 adds deterministic claim-to-claim reasoning only. It does not activate MR-TI-2 entity scoring and does not modify the active TI-1 path.

## Implemented
- `DEPENDS_ON`: directional, `fromClaim` depends on `toClaim`.
- dependency DAG validation with hard cycle rejection.
- exponential dependency ceiling: `ceiling = parentProbability ^ strength`.
- unknown dependency parents never become false and impose no ceiling.
- `CONTRADICTS`: treated as a symmetric logical relationship.
- cross-claim contradiction contribution: `strength * opposingClaimProbability`.
- multiple relationship contradictions combine via noisy-OR.
- evidence contradiction and relationship contradiction combine via noisy-OR.
- raw claim probability and contradiction review state are recomputed after relationship contradiction.
- dependency ceilings are applied after contradiction propagation, parent-first.

## Deliberately deferred to Build 6
- weighted coverage
- represented confidence
- foundational integrity
- final Truth Index aggregation
- V2 snapshot activation

## Persistence
No new migration is required. Build 1 already introduced `genesis_g8_truth_v2_claim_relationships` with `DEPENDS_ON` and `CONTRADICTS` edges. Existing G8/TI-1 rows remain untouched.

# MR-TI-2 Build 3 — Deterministic Evidence Mathematics

Build 3 adds the isolated deterministic evidence-math layer only. It does not activate Matrix 1, alter the live TI-1 calculation, or mutate existing G8 intelligence rows.

## Frozen functions

Intrinsic evidence quality uses the equal-weight mean of authority, directness and traceability, penalised by weighted standard deviation:

`Q = clamp(mu_w - 0.5 * sigma_w, 0, 0.999)`

Freshness is claim-contract-specific exponential half-life decay:

`F(t) = 2^(-ageDays / halfLifeDays)`

Evidence lineage independence is exponential shared-information decay:

`I(r) = 3^(-derivativeDepth)`

Effective evidence strength is:

`q = clamp(Q * F * I, 0, 0.999)`

Freshness and independence modifiers are allowed to equal 1.0 for a current root observation. The 0.999 ceiling applies to intrinsic/effective evidential strength, not to the modifier functions themselves.

## Persistence boundary

The existing `genesis_g8_truth_v2_evidence_assessments` sidecar continues to persist only primitive observations (authority, directness, traceability, timestamps and lineage). Q, F, I and q are deliberately recomputed rather than persisted, preventing stale derived maths when contracts or calculation versions evolve.

## Activation boundary

No live research worker or TI calculation path is switched in Build 3. Matrix 1 consumes this layer in Build 4.

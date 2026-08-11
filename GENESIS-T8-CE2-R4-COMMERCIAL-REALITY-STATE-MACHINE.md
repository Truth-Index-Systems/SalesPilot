# Genesis T8 — CE2-R4 Commercial Reality State Machine

## Status
Additive CE2 Evolution release. Frozen CE-R2 / UDOSIB 1.0.0 remains unchanged.

## Purpose
CE2-R4 converts the descriptive Commercial Reality introduced in R1 into a deterministic decision-state machine using three already-governed axes: frozen commercial viability/coherence, R2 epistemic qualification, and R3 temporal qualification.

## Decision states
- `IMPOSSIBLE` — frozen commercial mathematics eliminated the reality.
- `DORMANT` — reality survives mathematically but its explicit validity window has not started.
- `EXPIRED` — the reality is outside its explicit validity window.
- `UNRESOLVED` — commercial viability is unresolved or decision-critical knowledge cannot supply directional force.
- `CONTESTED` — current decision-critical verified knowledge is contradictory.
- `POSSIBLE` — reality survives and is current, but decision-critical verified knowledge remains uncertain.
- `ESTABLISHED` — reality survives, is temporally usable, and all declared decision-critical knowledge can supply established directional force.

`EXPIRING` remains an orthogonal `WITHIN_DECISION_HORIZON` pressure flag rather than becoming a replacement decision state.

## Critical-knowledge rule
R4 does not assume every missing or unknown fact is decision-critical. The caller supplies an explicit canonical set of decision-critical knowledge IDs, which must already exist in the R2 epistemic profile. Optional enrichment cannot downgrade an otherwise established reality.

## Constitutional precedence
1. Commercial elimination.
2. Reality-level temporal expiry/not-yet-active.
3. Commercial viability unresolved.
4. Current decision-critical contradiction.
5. Decision-critical no-directional-force states.
6. Decision-critical verified uncertainty.
7. Established reality.

## Transition model
Transition state is never caller-authored. R4 derives both snapshots and then derives whether the governing change came from commercial, temporal, epistemic, or multiple axes while preserving the immutable Commercial Reality identity.

## Non-goals
No opportunity ranking, route ranking, contact ranking, research ranking, hidden weights, probabilities, default thresholds, AI decision authority, or changes to Truth Index / UDOSIB v1.

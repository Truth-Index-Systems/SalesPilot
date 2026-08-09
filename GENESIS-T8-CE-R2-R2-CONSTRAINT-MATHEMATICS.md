# Genesis T8 CE-R2 R2 — Constraint Mathematics

## Status
Implementation candidate. This release defines primitive local UDOSIB constraint mathematics only. It does not implement graph propagation, commercial dependency weighting, commercial coherence, opportunity ranking, or research prioritisation.

## Responsibility boundary
AI owns semantic interpretation and emits categorical polarity (`SUPPORTS_REALITY`, `OPPOSES_REALITY`, `UNKNOWN`) plus the already-constitutional constraint class. TI owns probability, confidence, coverage, evidence dependency and contradiction severity. UDOSIB performs deterministic arithmetic over those canonical inputs.

## Primitive truth signal
For TI probability `p` and TI confidence `c`, both in `[0,1]`:

`r = (2p - 1)c`

This centres truth at epistemic neutrality (`p = 0.5`) and ensures low TI confidence weakens mathematical force. Coverage is deliberately excluded from this signal: absence of knowledge must not become commercial opposition.

AI-supplied categorical polarity determines direction only. `SUPPORTS_REALITY` keeps the sign; `OPPOSES_REALITY` reverses it; `UNKNOWN` has zero viability force. AI supplies no numeric weight.

## Knowledge representation
Represented knowledge is kept orthogonal to commercial direction:

`k = coverage × confidence`

`knowledgeDeficit = 1 - k`

This lets an apparently strong opportunity remain viable while still being marked poorly known.

## Constraint-class effects
Boundary constraints expose survival support and elimination support but R2 deliberately does not make the final binary elimination decision. That belongs to R3 propagation, where all dependencies can be evaluated consistently.

Limiting constraints expose restrictive pressure only. Supporting constraints expose positive support only and cannot create a penalty when absent. Unknown constraints exert zero viability force. Contradictory constraints carry TI contradiction severity forward unchanged; commercial dependency weighting is deferred to R3.

## Contradiction rule
CE-R2 does not recalculate contradiction. TI already owns contradiction mathematics. R2 consumes TI severity `x in [0,1]` as `contradictionUncertainty = x`. R3 will combine that TI-owned uncertainty with the local commercial dependency path, matching the agreed principle: truth uncertainty comes from TI; commercial significance comes from the active seller/offering/target relationship.

## Explicit non-goals
No arbitrary weights. No weighted average. No opportunity score. No commercial coherence equation. No cross-constraint reinforcement. No dependency propagation. No ranking. No AI numeric decisions.

# Genesis T8 CE-R2 R6 — Research Intelligence

## Purpose
R6 gives Genesis T8 a deterministic answer to: **which single unresolved fact should be researched next to improve the current commercial decision?**

R6 does not change commercial fit and does not interpret semantics. AI creates canonical research questions; existing R3/R4 state determines how decision-relevant each unresolved question is.

## Value of Information
Genesis does not use a weighted expected-value score. Research priority is a lexicographic decision vector:

1. `VIABILITY_PIVOTAL` — can resolve whether the commercial reality survives.
2. `REALISATION_PIVOTAL` — can resolve whether a viable reality is reachable/actionable.
3. `STABILITY_PIVOTAL` — concerns the nearest surviving boundary and can materially clarify robustness.
4. `ASSURANCE_GAP` — improves knowledge sufficiency or resolves an active TI contradiction without currently changing categorical viability/realisability.
5. `NO_DECISION_VALUE` — the current decision does not justify this research action.

Within the same class, Genesis prefers the largest existing unresolved information mass. Ties resolve by canonical research ID only for reproducibility.

## Ownership
- **AI** owns the semantic research question and maps it to canonical tokens/constraints/contact/route concepts.
- **TI** owns truth probability, confidence, coverage and contradiction qualification after research returns evidence.
- **UDOSIB R6** owns deterministic research priority.
- Research follows the loop: **AI → TI → UDOSIB**, then the commercial reality is recalculated from clean state.

## Stop rule
No arbitrary research threshold is introduced. If no supplied canonical research candidate has positive decision value, R6 returns `researchRequired=false`. A definitively eliminated commercial reality does not receive speculative route/contact research.

## Portfolio rule
R5 opportunity order remains authoritative. R6 spends the next research action on the first R5-ranked opportunity that still has a decision-relevant unknown, then selects that opportunity's highest lexicographic research target.

## Invariants
Unknown information never counts as negative commercial evidence. Research cannot modify Commercial Coherence directly. Duplicate semantic research questions cannot multiply priority. AI cannot provide research weights, scores, probabilities, confidence, utility or expected value.

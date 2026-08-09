# Genesis T8 CE-R2 R8 — UDOSIB Commercial Mathematics v1.0 Freeze Audit

## Verdict

**FREEZE DENIED — 5 blockers found.**

The R1→R7 inherited validation chain is green, CE-R1 CKR v1 and TI-2.1.8 manifests remain intact, and the core CE-R2 architecture survives audit. However, five mathematical/integrity defects can change viability, ranking, assurance, or research allocation incorrectly. They must be patched and then the entire audit rerun before UDOSIB v1.0 can freeze.

## Baseline regression status

- CE-R2 R1→R7 inherited gate: PASS
- CE-R1 Build 7 static/runtime freeze checks: PASS
- TI-2.1.8 freeze manifest: MATCH
- CKR v1 freeze manifest: MATCH
- TI legacy eradication: 39/39
- AI canonicalisation: 20/20
- Dispatch audit: 30/30
- Governance lease reconciliation: 16/16
- Strict TypeScript across `lib/genesis-t8`: PASS

## Blocker 1 — REQUIRED dependency can rescue a violated downstream boundary

### Reproduction

A strongly satisfied upstream boundary with a `REQUIRED` edge into a downstream boundary currently propagates **boundary survival support** as well as failure.

Synthetic case:

- upstream boundary survival support = 0.90
- downstream boundary local elimination support = 0.60
- without dependency: overall viability = `ELIMINATED`
- with `REQUIRED upstream → downstream`: downstream effective survival becomes 0.90, elimination stays 0.60, overall viability becomes `SURVIVES`

This violates the UDOSIB principle that a violated reality boundary cannot be compensated for by strength elsewhere.

### Required fix

`REQUIRED` dependency propagation must be asymmetric for boundary channels:

- boundary elimination/failure **may cascade downstream**;
- boundary survival/satisfaction **must not rescue another boundary**.

Satisfaction of prerequisite A does not prove satisfaction of prerequisite B.

## Blocker 2 — Portfolio research has incumbent-rank bias

`selectNextPortfolioResearch()` iterates opportunities in existing R5 order and returns the first opportunity with any research-worthy unknown.

Therefore:

- rank #1 with a minor `ASSURANCE_GAP`
- rank #2 with a `VIABILITY_PIVOTAL` unknown

causes Genesis to research #1 first.

This can lock in current rankings because uncertainty suppresses a candidate's rank, while the rank itself prevents Genesis from resolving the uncertainty that could move the candidate upward.

### Required fix

Portfolio research ordering must compare the cross-portfolio **decision-impact class first**, then use R5 opportunity rank only inside the same impact class (or as a later deterministic tie-break).

Recommended order:

1. `VIABILITY_PIVOTAL`
2. `REALISATION_PIVOTAL`
3. `STABILITY_PIVOTAL`
4. `ASSURANCE_GAP`
5. within equal class: current R5 rank
6. unresolved mass
7. canonical research ID

This preserves value-of-information logic without weighted utility scores.

## Blocker 3 — Optional unknown supporting fact can collapse all decision assurance

R4 currently computes Knowledge Sufficiency as the minimum knowledge value across **every reinforcement group**.

Synthetic case:

- required geography boundary: ~97% support, fully known
- optional supporting expansion signal: unresearched
- viability: `SURVIVES`
- Commercial Coherence: ~0.97
- Commercial Stability: ~0.97
- Knowledge Sufficiency: **0**
- Reasoning Confidence: **0**

An unknown optional positive signal therefore becomes indistinguishable from ignorance about a decision-critical boundary.

### Required fix

Knowledge Sufficiency must become **decision-relevance aware** while remaining non-weighted.

Recommended categorical knowledge channels:

- `VIABILITY_KNOWLEDGE` — unresolved active boundaries / required dependencies
- `REALISATION_KNOWLEDGE` — contact and route sufficiency
- `STABILITY_KNOWLEDGE` — nearest active limiting/boundary state
- `SUPPORTING_CONTEXT_KNOWLEDGE` — optional enrichment only

Overall Decision Assurance should be governed by the weakest **decision-critical** channel, not every optional support group.

Optional supporting unknowns may create research opportunity, but cannot reduce certainty about a viability conclusion they are not required for.

## Blocker 4 — Cross-release deterministic state can be forged at runtime

R5 accepts structurally shaped R4 objects without enforcing cross-field consistency.

Reproduced impossible object:

- `realisation.state = ACTIONABLE`
- embedded `commercial.viability = ELIMINATED`

R5 accepted it and ranked it #1.

This violates fail-closed deterministic boundaries. TypeScript structural types are not runtime authority.

### Required fix

Add runtime invariants / branded deterministic outputs at each release boundary:

- R3 propagation output
- R4 coherence output
- R4 realisation output
- R5 ordering input/output
- R6 research input
- R7 explanation input

At minimum validate:

- `NOT_VIABLE ↔ commercial.viability === ELIMINATED`
- `COMMERCIAL_REALITY_UNRESOLVED ↔ viability === UNRESOLVED`
- actionable states require `SURVIVES`
- `actionable` boolean matches state
- route/contact combinations match reason code
- all mathematical values finite and inside declared bounds

Preferred hardening: opaque/branded constructors so downstream functions consume validated kernel states rather than arbitrary object literals.

## Blocker 5 — Named-contact precedence is mathematically premature

R5 hard-codes:

`ACTIONABLE > ACTIONABLE_WITHOUT_NAMED_CONTACT`

But R4 explicitly states that Contact/Route engines do not yet define their own mathematics.

This creates an unsupported universal claim that any named-person actionable path is better than any organisational/intermediary actionable path. Example: a plausible person reached indirectly can categorically outrank a direct procurement route into the organisation, regardless of the rest of the state.

### Required fix

Until Contact/Route mathematics exist, do not impose an unproved quality ordering between these two valid actionable modes.

Recommended R8 rule:

- place `ACTIONABLE` and `ACTIONABLE_WITHOUT_NAMED_CONTACT` in the same **ACTIONABLE tier**;
- preserve their distinct state/reason codes for explanation;
- allow commercial Pareto/maximin ordering to distinguish them only on currently justified axes;
- later Contact/Route engines may add deterministic route/contact ordering through their own frozen contracts.

This prevents CE-R2 from freezing a contact-channel preference it does not mathematically own.

## Architecture findings that passed

- AI remains semantic authority; no numeric semantic weight is accepted.
- TI remains truth/contradiction authority.
- Unknowns have zero viability force.
- Supporting constraints cannot create negative pressure.
- Limiting constraints cannot directly eliminate.
- Duplicate propagation paths use idempotent max aggregation.
- Dependency cycles fail closed.
- Independent support reinforcement is bounded.
- Duplicate semantic support groups use max, not sum.
- Commercial viability remains distinct from route/contact realisation.
- Commercial impossibility cannot legitimately be rescued by route/contact in the normal R4 constructor path.
- Opportunity ordering remains non-weighted (Pareto + maximin).
- R6 local research priority is lexicographic and non-weighted.
- R7 explanation is non-authoritative and trace-bound.
- Application free-tier policy is not embedded in mathematics.

## R8 patch plan

1. **Boundary monotonicity patch** — REQUIRED dependency cascades failure only; add monotonic boundary regression matrix.
2. **Decision-relevant assurance patch** — split knowledge channels and prevent optional supporting unknowns collapsing global assurance.
3. **Portfolio value-of-information patch** — impact class before incumbent R5 rank across opportunities.
4. **Deterministic state authority patch** — runtime invariants/branded outputs across R3→R7 boundaries.
5. **Actionable-tier neutrality patch** — remove premature named-contact categorical advantage until Contact/Route mathematics exist.
6. Add R8 adversarial cases reproducing every defect above.
7. Rerun all R1→R7 validators and frozen CE-R1/TI regressions.
8. Generate UDOSIB Commercial Mathematics v1.0 freeze manifest only after **0 blockers** remain.

## Freeze rule

There is no conditional freeze.

- If all five blockers are closed and the R8 adversarial suite passes: **FREEZE UDOSIB v1.0**.
- If any blocker remains: **FREEZE DENIED**.

# Genesis T8 CE2-R3 — Temporal Mathematics

## Status
Post-freeze additive CE2 Evolution build. Frozen CE-R1, TI-2.1.8 and UDOSIB 1.0.0 remain unchanged.

## Purpose
Make time a first-class deterministic axis of Commercial Reality without introducing probabilistic decay, hidden freshness weights, or AI numerical authority.

## Added
- Explicit RFC3339 validity intervals (`validFrom`, `validTo`).
- Deterministic temporal states: `NOT_YET_ACTIVE`, `ACTIVE`, `EXPIRING`, `EXPIRED`, `TIME_UNBOUNDED`.
- Explicit policy-supplied decision horizon; CE2-R3 invents no default "soon" threshold.
- Deterministic age classes derived from temporal state, not from arbitrary scoring.
- Exact elapsed/remaining durations where bounded.
- Temporal permission for Commercial Reality, orthogonal to frozen UDOSIB viability.
- Mapping from temporal state into CE2-R2 epistemic temporal validity.
- Deterministic closed-interval relations for future dependency/route reasoning.

## Constitutional boundaries
- No Truth Index probability/confidence/freshness changes.
- No exponential, linear, half-life, or hidden decay function.
- No opportunity, route, contact, or research ranking.
- No mutation to frozen UDOSIB commercial coherence.
- `TIME_UNBOUNDED` means no declared time bound; it does not mean verified current/fresh knowledge.

## Validation
Run `npm run genesis:t8-ce2-r3-check`.

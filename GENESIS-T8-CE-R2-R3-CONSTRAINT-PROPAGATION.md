# Genesis T8 CE-R2 R3 — Constraint Propagation

R3 turns R2 local constraint state into a deterministic commercial dependency system.

## Responsibility boundary

- AI owns semantics: it determines whether a dependency exists and selects the categorical dependency mode.
- TI owns truth and contradiction severity.
- UDOSIB owns deterministic propagation and boundary survival state.
- No AI-supplied numeric importance, weight, attenuation, fit score or ranking is permitted.

## Dependency modes

- `REQUIRED`: may carry boundary state, limiting pressure and uncertainty.
- `LIMITING`: may carry limiting pressure and uncertainty only.
- `SUPPORTING`: may carry positive support and uncertainty only.
- `INFORMATIONAL`: carries uncertainty/knowledge deficit only.

The reasoning dependency graph is a DAG even though the underlying 9D commercial graph may contain legitimate cycles. A reasoning DAG is a temporary deterministic interpretation path, not canonical knowledge.

## Propagation algebra

R3 intentionally uses idempotent max-lattice aggregation rather than addition:

`effective(target) = max(local(target), eligible incoming propagated states)`

This prevents duplicate paths from manufacturing commercial force. Reinforcement is reserved for R4, where it can be explicitly designed and tested.

## Contradictions

TI contradiction severity is never recomputed. Commercial relevance is binary at this layer:

`relevant contradiction = TI contradiction severity × I(active dependency path)`

A contradiction unrelated to the seller/offering reasoning path therefore has zero commercial impact. A relevant contradiction keeps its TI-owned magnitude.

For a boundary, contradiction can make the result unresolved when contradiction uncertainty is at least as large as the absolute survival/elimination margin. This prevents a materially unresolved truth conflict from being treated as a clean binary boundary result.

## Boundary viability

Boundary state is the only primitive that can eliminate a reality in R3. Supporting and limiting channels can never override a violated boundary.

- any deterministically dominated violated boundary -> `ELIMINATED`
- no eliminated boundaries but at least one unresolved boundary -> `UNRESOLVED`
- otherwise -> `SURVIVES`

Knowledge deficit remains separate from commercial direction.

# MR-TI-2 Build 8 — Production Activation and v2.0 Freeze

Build 8 activates MR-TI-2.0 as the production Truth calculation and eligibility engine.

## Production switch
- `hydrateGenesisG8EntityTruth()` now calculates and persists MR-TI-2.0 rather than hydrating TI-1.
- Knowledge retrieval and eligibility consume the MR-TI-2 state vector.
- TI-1 read-model/equation files remain in the repository only for historical compatibility and audit; they are no longer on the active knowledge-retrieval path.
- Repair completion now explicitly invokes the MR-TI-2 production calculator.
- Founder UI no longer labels MR-TI-2 as shadow intelligence.

## Eligibility semantics
- Missing foundational evidence is a weighted coverage/base-truth problem, not an automatic human-review trigger.
- `HUMAN_REVIEW_REQUIRED` is driven by the MR-TI-2 strong two-sided contradiction gate (or explicit founder review state).
- `VERIFY` routes to deterministic refresh/verification.
- Existing founder approval/rejection governance remains authoritative without rewriting the mathematics.

## Legacy isolation
- TI-1 historical tables and snapshots are preserved.
- No destructive Supabase migration is introduced.
- A Build 8 legacy-leak validator prevents production hydration/retrieval/eligibility from importing TI-1 calculator/read-model logic.
- Compatibility criticality labels are emitted only at the existing repair-planner boundary; they do not participate in MR-TI-2 mathematics or eligibility.

## Freeze
- Engine version: `MR-TI-2.0`
- Contract version: `MR-TI-2-CONTRACTS-1.0`
- Maximum represented claim/entity Truth: `99.9`
- Builds 1–7 remain cumulative in this package.

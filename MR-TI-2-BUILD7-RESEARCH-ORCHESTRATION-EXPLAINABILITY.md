# MR-TI-2 Build 7 — Equation-Aware Research Orchestration and Explainability

Build 7 integrates MR-TI-2 into the live evidence-acquisition boundary while keeping TI-1 as the production eligibility/calculation path until Build 8.

## Added
- Equation-aware single-claim repair research contract using the frozen MR-TI-2 claim contract.
- AI returns primitive observations only: SUPPORT/CONTRADICT direction, authority, directness, traceability, dates, lineage, derivative depth and Matrix-2 relationship hints.
- AI is explicitly prohibited from calculating Truth Index, claim probability, coverage, foundational integrity, freshness, independence or contradiction severity.
- V2 evidence assessments are persisted beside the existing G8 evidence rows.
- Evidence-supported DEPENDS_ON / CONTRADICTS hints are persisted into the Matrix-2 relationship sidecar.
- Each completed repair performs a shadow MR-TI-2 calculation from V2-assessed evidence and persists an append-only V2 snapshot.
- Legacy evidence lacking V2 primitive assessments is deliberately excluded from shadow MR-TI-2 rather than silently inventing V2 inputs.
- Deterministic research prioritisation distinguishes missing claims, limiting claims, verification contradictions and mandatory human-review contradictions.
- Deterministic explainability turns the MR-TI-2 state vector into strengths, limitations and a next research action.
- Founder Dashboard receives an explicitly labelled `MR-TI-2 shadow intelligence` panel. It does not alter production eligibility.

## Production boundary deliberately preserved
- `hydrateGenesisG8EntityTruth()` / TI-1 remains active after repair completion.
- Existing TI-1 snapshot/history tables remain untouched.
- Build 7 does not redirect production eligibility, retrieval or dispatch to MR-TI-2.
- Build 8 remains the isolated final calculation-path switch and hardening release.

## No migration required
Build 1/2 already created the V2 assessment, relationship, contract-profile and snapshot tables. Build 7 consumes those additive tables without changing their schema.

## Validation
- MR-TI-2 Build 5 structural validator: 29/29.
- MR-TI-2 Build 5 mathematical invariants: 15/15.
- MR-TI-2 Build 6 structural validator: 38/38.
- MR-TI-2 Build 6 mathematical invariants: 26/26.
- MR-TI-2 Build 7 integration validator: 26/26.

A standalone full TypeScript compile requires project dependencies (`next`, `zod`, Node types), which are intentionally absent from the ZIP. The consuming Vercel/local build remains the compile gate.

# Genesis G8.1 Release 1 — Production Truth Kernel Foundation

## Base

Built directly on `MarketRoute-Genesis-G5.1.13.4.3-All-AI-Output-Ceiling-Hardening(3).zip`.

## Purpose

Introduce the first production foundation of Genesis G8 without changing the frozen MarketRoute customer pipeline.

## Dual-channel constitutional model

Genesis G8 does **not** replace MarketRoute's existing live discovery engine.

MarketRoute will ultimately operate two peer intelligence channels:

1. **Knowledge Intelligence** — retrieve, reuse, validate and refresh accumulated Truth-Index-scored intelligence.
2. **Discovery Intelligence** — preserve the existing live web/AI discovery path for new, sparse, emerging or low-confidence markets.

The intended later default is `KNOWLEDGE_FIRST_WITH_DISCOVERY_FALLBACK`, but Release 1 only defines this contract. No production routing has been changed.

## Truth Kernel constitutional boundary

- AI may propose intelligence and evidence.
- The Truth Kernel contains no AI, web, database, Supabase, UI or pipeline dependency.
- Confidence is evidence reliability.
- Coverage is intelligence completeness.
- Critical claims can cap entity reliability.
- Low confidence does not delete intelligence; it creates deterministic review signals.
- Every result records equation version `MR-TI-1.0`.
- Intelligence provenance can identify whether knowledge came from Knowledge Intelligence or Discovery Intelligence.

## MR-TI-1.0

Effective evidential force:

`strength × sourceAuthority × traceability × independence × freshness`

Freshness uses exponential half-life decay:

`freshness = 0.5 ^ (ageDays / halfLifeDays)`

Supporting and contradictory evidence accumulate independently using bounded noisy-OR aggregation.

Claim confidence:

`support × (1 - contradiction)`

Entity confidence is a criticality-weighted mean over claims represented by evidence.

Coverage is the weighted share of the intelligence contract represented by evidence.

Initial entity index:

`confidence × coverage`

Critical proposition ceiling:

`TruthIndex = min(confidence × coverage, weakestCriticalClaimConfidence)`

The equation is intentionally simple, deterministic and versioned. Future human-review outcomes will calibrate later equation versions rather than adding speculative complexity now.

## Human review output

Deterministic review reasons:

- `LOW_TRUTH_INDEX`
- `LOW_CONFIDENCE`
- `LOW_COVERAGE`
- `CRITICAL_CLAIM_WEAK`
- `MATERIAL_CONTRADICTION`

Release 1 does not create the founder review dashboard or alter opportunity eligibility/persistence.

## Validation

Run:

`npm run genesis:g81-truth-kernel-check`

The validation also asserts that G8 is not imported by the existing discovery/contact/opportunity/pipeline/autonomy paths in this release.

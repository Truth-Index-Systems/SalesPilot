# G2 Intelligence Tuning

This pass tunes the evidence funnel without permitting unsupported companies.

## Changes

- Zero post-normalisation candidates is now a valid `NO_RESULTS` outcome rather than a retryable worker failure.
- Official evidence excerpts support exact and token-overlap matching.
- A sparse official website may pass with one reachable official source only when both campaign fit and model confidence are strong.
- Weak-fit candidates continue to require stronger evidence.
- Each held candidate records a structured reason and verification diagnostics.
- Every completed discovery cycle persists a funnel summary containing candidate, evidence, excerpt-match, verification, hold-reason, and saved counts.

## Trust boundary

Every saved company still requires:

- a reachable official company homepage;
- at least one reachable source on the same official domain;
- sufficient evidence quality;
- sufficient independently calculated campaign-fit confidence.

No directory-only, unsupported, or unreachable company is saved.

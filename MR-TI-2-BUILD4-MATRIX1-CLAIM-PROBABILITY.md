# MR-TI-2 Build 4 — Matrix 1 + Raw Claim Probability

Build 4 adds the first aggregation layer of MR-TI-2 without activating it in the live G8 Truth path.

## Included

- Matrix 1 evidence→claim cells backed exclusively by Build 3 deterministic evidence strength.
- Independent noisy-OR aggregation of supporting and contradictory evidence.
- Frozen raw claim probability contract:
  - no evidence → `null` / unrepresented,
  - support only → `P=S`,
  - contradiction only → `P=1-C`,
  - bilateral evidence → `S(1-C) / [S(1-C)+C(1-S)]`.
- Represented probability range `[0.001, 0.999]`; unknown remains `null`.
- Contradiction severity `K=S*C` and bilateral strength `min(S,C)`.
- Deterministic review gate:
  - AUTO by default,
  - VERIFY when `K >= 0.36` and bilateral strength `>= 0.50`,
  - HUMAN_REVIEW_REQUIRED when `K >= 0.64` and bilateral strength `>= 0.70`.

## Deliberately excluded

- Matrix 2 relationship propagation.
- Entity aggregation / coverage / represented confidence / foundational integrity.
- Live TI-1 routing changes.
- Supabase schema changes; Build 1 already provides the additive storage foundation.

Build 4 therefore ends at a deterministic raw claim state and review decision.

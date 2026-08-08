# MarketRoute Genesis G5 — Release 7: Engagement Quality Engine

Release 7 adds a separate, deterministic Engagement Confidence score after mandatory R6 self-review has passed.

## Boundary

- G4 Opportunity Score remains authoritative and unchanged.
- R7 never reads or modifies Opportunity Score.
- R7 does not research, generate, rewrite, select routes, approve, queue, or send.
- R6 PASS remains authoritative; R7 measures readiness quality, it does not overturn review.

## Lifecycle

R7 enriches `READY_FOR_APPROVAL` in place. It introduces no new lifecycle state.

`SELF_REVIEW --PASS--> READY_FOR_APPROVAL --R7 score--> READY_FOR_APPROVAL`

Release 8 may only approve a strategy after R7 has persisted Engagement Quality.

## Dimensions

The deterministic score uses eight weighted dimensions:

- Commercial relevance — 18%
- Route alignment — 14%
- Evidence strength — 18%
- Personalisation quality — 10%
- Message clarity — 12%
- CTA quality — 10%
- Channel suitability — 10%
- Risk safety — 8%

Inputs come only from persisted R3 channel strategy, R5 safety manifest, and the final R6 PASS review. Evidence strength receives a conservative penalty when no verified personalisation fact exists.

## Persistence

Canonical fields are stored on `engagement_strategies` and every completed assessment is appended to `engagement_quality_assessments` with a source fingerprint.

## Approval Guard

`READY_FOR_APPROVAL -> APPROVED` now raises `G5_ENGAGEMENT_QUALITY_REQUIRED` unless both the quality object and Engagement Confidence have been persisted.

## Migration

Apply `0080_genesis_g5_release7_engagement_quality_engine.sql`.

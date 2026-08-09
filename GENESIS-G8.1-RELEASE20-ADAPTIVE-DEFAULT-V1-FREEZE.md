# Genesis G8.1 Release 20 — Adaptive Default / V1 Freeze

Genesis G8 Version 1 is now complete.

## Frozen operating model

MarketRoute uses two permanent intelligence channels:

1. **Knowledge Intelligence** — fast retrieval of evidence-backed intelligence already held by Genesis.
2. **Discovery Intelligence** — live web research for unknown, stale, blocked, contradictory, or low-confidence intelligence.

The default operating model is **ADAPTIVE_DEFAULT**: Knowledge gets first refusal when the existing deterministic eligibility engine says it is usable. Discovery is never removed; it remains the universal fallback, verifier, repair channel, and source of new intelligence.

## R20 production rules

- System default activation level is 5 (Adaptive Default).
- Founder overrides remain available from the protected command centre.
- Clearing an override restores Adaptive Default without redeployment.
- The activation controller fails closed to Discovery if the runtime snapshot cannot be read.
- R5/R13 eligibility remains the primary Knowledge authority; R20 does not create a competing Truth equation.
- Server-side campaign merge continues to re-verify entity status and minimum safety floors.
- Ordinary production degradation reduces effective rollout by one level.
- Severe degradation can reduce effective rollout by two levels.
- Campaign launch remains fail-open: failure in Knowledge acceleration never prevents the legacy Discovery path.
- Discovery continues after Knowledge seeding, enriching/deduplicating rather than being disabled.

## Freeze boundary

Do not redesign G8 V1 after R20 unless a production defect, data integrity issue, privacy issue, or reliability failure requires it. New optimisation ideas — including Truth-aware model prompting — belong in the next Genesis evolution rather than changing this frozen contract casually.

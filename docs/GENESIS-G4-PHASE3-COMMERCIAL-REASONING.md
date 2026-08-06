# SalesPilot Genesis G4 Phase 3 — Commercial Reasoning Engine

Phase 3 adds the intelligence step that understands an approved opportunity before any outreach is written.

## Pipeline

Approved Opportunity → Engagement Builder → Commercial Reasoning → READY_FOR_DRAFT

The scheduler claims one eligible engagement per bounded cycle. The model receives persisted Business DNA, campaign configuration, opportunity scoring and reasoning, company intelligence, buyer intelligence, and their supported evidence. It returns strict `engagement-commercial-reasoning/v1` JSON.

## Persisted output

- Commercial objective
- Buying angle
- Primary pain
- Urgency and explanation
- Commercial risk
- Value theme
- Buyer priorities
- Likely objections
- Recommended tone
- CTA strategy
- Evidence references
- Known limitations
- Confidence and reasoning

Every request passes through existing AI governance. Analysis jobs are lease-owned, retry-safe, bounded to five attempts, prompt-versioned, and recorded in generation history. The customer timeline receives a calm outcome event only after successful completion.

## Phase boundary

This phase does not generate an email, change the frozen G3.5 repositories, send outreach, schedule messages, or bypass governance.

## Migration

Apply `0036_genesis_g4_phase3_commercial_reasoning.sql` after migration `0035`.

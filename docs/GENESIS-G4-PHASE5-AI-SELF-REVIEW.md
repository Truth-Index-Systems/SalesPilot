# SalesPilot Genesis G4 Phase 5 — AI Self Review

Phase 5 adds an independent, scheduler-owned quality review after outreach generation.

## Flow

`DRAFT_READY -> AI self review -> DRAFT_REVIEW` when the hard quality gate passes.

Drafts that do not pass remain `DRAFT_READY` and receive a persisted `REGENERATE_REQUESTED` outcome. Phase 5 does not regenerate, approve, queue or send them.

## Quality gate

A pass requires all of the following:

- Combined score at least 75
- Factual accuracy at least 80
- Evidence use at least 75
- No unsupported claims
- AI reviewer recommendation to approve

## Persisted scores

Personalisation, relevance, professionalism, factual accuracy, evidence use, likelihood of response, confidence and combined Engagement Score are stored with full review output, prompt version, model usage, latency and response ID.

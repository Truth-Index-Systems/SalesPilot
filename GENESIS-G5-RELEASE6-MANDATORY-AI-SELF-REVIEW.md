# SalesPilot Genesis G5 — Release 6: Mandatory AI Self Review + Automatic Rewrite

Release 6 consumes only the persisted G5 engagement artefacts produced by Releases 2–5. G4 remains immutable.

## Lifecycle

- `SELF_REVIEW -> READY_FOR_APPROVAL` on `PASS`.
- `SELF_REVIEW -> FAILED_RETRYABLE(OUTREACH_GENERATION)` on `REWRITE`; only the generated outreach is cleared and R4 regenerates on the same persisted R3 route using the exact review criticism.
- `SELF_REVIEW -> FAILED_TERMINAL` on `BLOCK`.
- Maximum automatic rewrites: 2. A draft that still cannot pass after two rewrites is blocked.

## Review contract

The dedicated G5 reviewer scores factual accuracy, evidence alignment, route alignment, hallucination safety, tone, message length, commercial clarity, CTA quality, spam characteristics, overclaiming and personalisation relevance. The model proposes PASS/REWRITE/BLOCK, but deterministic application policy owns the final outcome.

Every review is appended to `engagement_strategy_reviews`. The current review is also persisted on `engagement_strategies` for fast state inspection.

## Rewrite contract

R4 generation is prompt-versioned to `g5-outreach-generation/v3`. When R6 requests a rewrite, the stored review is supplied back to R4 as `rewriteInstruction`. The route, channel, commercial reasoning, immutable G4 snapshot and R5 safety manifest are preserved.

## Explicitly not Release 6

No human approval UX changes, no engagement quality score, no autopilot approval, no queue/send execution and no G4 mutation.

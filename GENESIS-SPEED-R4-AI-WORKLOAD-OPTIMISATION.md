# Genesis Speed R4 — AI Workload Optimisation

## Goal
Reduce provider reasoning time, input tokens and output tokens without weakening MarketRoute's commercial authority boundaries or the R1–R3 resumability/event/concurrency architecture.

## Changes

### 1. Central workload profiles
`lib/ai/workload-profile.ts` is now the single default budget map for active executives.

Defaults:
- Business Understanding: medium / 6,500 max output
- Company Discovery: medium / 4,500
- Route Intelligence first pass: medium / 6,000
- Route Intelligence expansion: medium / 4,500
- G5 Commercial Reasoning: high / 2,600
- G5 Channel Strategy: medium / 1,800
- G5 Outreach: low / 1,400
- G5 Self Review: medium / 1,500

Commercial Reasoning remains protected at high effort. Route Intelligence moves from high to medium because its responsibility is now bounded and evidence-led. Self Review moves from high to medium because deterministic MarketRoute still owns the final policy decision.

Per-task R4 environment overrides exist, but defaults are conservative and bounded.

### 2. Purpose-built compact briefings
- Channel Strategy receives Commercial Reasoning plus the immutable G4 commercial route map.
- Outreach receives the approved commercial argument, channel decision, selected G4 route, personalisation safety manifest and rewrite instruction.
- Self Review receives the same decision basis plus the actual generated outreach, not the entire upstream snapshot.
- Generic compaction trims arrays and long reasoning strings more aggressively.
- Business Understanding source excerpts are capped at 4,500 characters per source.

Deterministic validators still use the complete authoritative source snapshots. Only model input is compacted.

### 3. Deterministic channel fast path
If there is exactly one G4 route that is viable, reachable and maps unambiguously to an execution channel, MarketRoute constructs the G5 Channel Strategy deterministically. No OpenAI request is reserved or submitted for that decision.

The result still passes the same immutable-route validator before persistence.

### 4. Output budgets
Every active background executive now consumes `profile.maxOutputTokens` instead of owning an independent hard-coded allowance. This makes output-token drift detectable and tunable.

### 5. Prompt-cache-friendly request layout
Stable responsibility instructions remain in the instruction prefix. Variable organisation/campaign/company/evidence metadata is placed in request input. Business Understanding no longer interpolates website/model/time into the stable instruction block. Route Intelligence pass-specific guidance is moved to variable input.

`aiPromptCacheKey()` records a stable prompt identity in request fingerprints. R4 relies on OpenAI's automatic prefix caching rather than introducing a model-family-specific explicit caching API parameter.

## Preserved boundaries
- R1 background submit/resume behavior unchanged.
- R2 webhook/collector ownership unchanged.
- R3 parallel reservation caps unchanged.
- G4 truth remains immutable.
- G5 commercial reasoning remains AI-led.
- deterministic MarketRoute continues to own validation, state transitions, approval and execution.

## Validation
Run:

```bash
npm run speed:r4-check
npm run speed:r3-check
npm run speed:r2-check
npm run speed:r1-check
npm run all-ai:background-resumability-check
```

No SQL migration is required for R4.

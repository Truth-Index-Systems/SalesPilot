# MarketRoute Genesis G5.1.13.4.3 — All-AI Output Ceiling Hardening

## Why
Production Company Discovery returned `OPENAI_BACKGROUND_INCOMPLETE:max_output_tokens`. GPT-5 reasoning tokens and the final strict structured output share the response output allowance, so ceilings that were reasonable for earlier workloads can terminate otherwise healthy background requests.

## Change
- Raises every active central AI workload profile to a 10,000-token default output ceiling.
- Raises the environment override safety cap from 12,000 to 20,000 tokens.
- Removes the hidden 3,200-token Business DNA Core cap; Core now uses the governed Business Analysis profile.
- Growth Strategy now defaults to the governed Business Analysis profile while preserving its explicit environment override.
- Replaces legacy hard-coded Commercial Reasoning (2,600), Outreach (1,800), and Self Review (1,600) ceilings with the same central governed workload profiles used by the current G5 agents.
- `STRUCTURED_OUTPUT_REPAIR` remains deterministic-only with zero AI output allowance.

## Safety
This raises maximum capacity, not requested output length. Strict schemas, prompt constraints, cost governance, background resumability, retry limits and evidence/quality gates are unchanged. No SQL migration is required.

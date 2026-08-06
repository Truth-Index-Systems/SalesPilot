# SalesPilot AI Cost Optimisation — Release B

Production cost reduction only. There is no test mode and no artificial scheduler throttling.

## Changes
- Central cost-safe default model: `gpt-5-mini`; explicit stage environment overrides remain supported.
- Compact AI contexts remove persistence, lease, retry, timeline and other non-commercial metadata.
- Evidence is ranked deterministically and bounded by stage.
- Company web-search context reduced from medium to low; contact research reduced from high to low.
- Company output reduced to 6–10 quality matches and 6,500 maximum output tokens.
- Buyer discovery limited to the strongest supported people/routes, six evidence records per person and 7,500 output tokens.
- Business source text bounded to eight sources and 6,000 characters per source.
- G4 commercial reasoning, outreach and self-review contexts are compacted and output limits reduced.
- Stable input fingerprints are included in governance request keys, preventing repeat reservation keys for identical meaningful inputs.
- No web search exists in commercial reasoning, outreach generation or self-review.

## Environment
`OPENAI_MODEL=gpt-5-mini` remains recommended. Task-specific model variables still override it deliberately. No automatic escalation to a larger model is introduced.

# Genesis AI Response Gateway Wiring Hotfix

## Root cause

The production AI stages were already routed through the shared structured-response gateway. The repeated customer-visible `Unterminated string in JSON` error was caused by two separate issues:

1. Business Intelligence used a 4,500-token output cap for a large schema containing Business DNA and multiple campaign proposals. GPT-5 reasoning tokens share that allowance with the final JSON, making mid-string truncation possible.
2. The public analysis-status endpoint replayed the raw stored database error message, exposing parser internals even when the worker classified the failure as retryable.

## Changes

- Increased Business Intelligence structured-output allowance to 9,000 tokens.
- Increased schema-constrained repair allowance to 9,000 tokens.
- Added safe gateway recovery diagnostics for deterministic and model-assisted repair.
- Ensured structured-output failures leave the AI boundary as safe classified errors rather than raw parser exceptions.
- Hardened worker classification for unterminated strings and unexpected-end parser failures.
- Masked all stored `INVALID_AI_OUTPUT` details in the public job-status response, including errors already persisted by previous deployments.
- Added `scripts/validate-ai-gateway-wiring-hotfix.mjs`.

## No database migration

No SQL migration is required.

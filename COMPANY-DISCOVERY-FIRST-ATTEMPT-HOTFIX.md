# Company Discovery First-Attempt Hotfix

## Root cause

Release B reduced Company Discovery `max_output_tokens` to 6,500 while using GPT-5 mini. GPT-5 reasoning tokens and final structured-output tokens share this allowance. Web-enabled company research could therefore return an HTTP 200 Responses API object with `status: incomplete` and `incomplete_details.reason: max_output_tokens` before the JSON document was complete.

The implementation then attempted to parse the truncated response and scheduled the normal one-hour retry. It also marked the AI usage ledger row successful before JSON/schema validation.

## Fix

- Set Company Discovery reasoning effort to `low`.
- Set the shared output allowance to 9,000 tokens.
- Bound actual output to 5–8 companies, at most four evidence items per company, and concise arrays/strings.
- Detect `status: incomplete` explicitly.
- Record incomplete, invalid JSON, and invalid schema responses as failed AI requests.
- Mark usage successful only after JSON and Zod schema validation.
- Classify incomplete output as retryable invalid AI output.
- Preserve production behaviour and all Release B/C optimisations.
- No test mode introduced.

## Validation

```bash
npm run company-discovery:first-attempt-check
npm run typecheck
npm run build
```

No SQL migration is required.

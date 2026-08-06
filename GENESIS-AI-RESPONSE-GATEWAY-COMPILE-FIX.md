# Genesis AI Response Gateway Compile Fix

Fixed the TypeScript contract mismatch between `parseStructuredAiResponse` and `requestRepair`.

The repair helper now receives the normalized raw structured-output string plus the explicit schema, JSON schema, schema name, API key and model fields it requires. This preserves the intended recovery behaviour while satisfying the generic TypeScript contract.

Validation passed:

- `node scripts/validate-ai-gateway-wiring-hotfix.mjs`
- `npm run genesis:ai-gateway-check`

No migration or environment-variable change is required.

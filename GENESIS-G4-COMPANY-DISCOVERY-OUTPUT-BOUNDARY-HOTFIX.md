# Genesis G4 — Company Discovery structured-output boundary hotfix

Company Discovery search/orchestration remains frozen. This patch changes only the response boundary between the structured AI gateway and the existing Company Discovery verifier.

## Root cause

The OpenAI JSON schema and the local Zod persistence schema were not identical. A mechanically recovered response could therefore be valid JSON yet fail local schema validation. The generic repair request reused the OpenAI schema, so it could repeat the same mismatch and consume Company Discovery's short technical retry allowance until the session became terminal.

## Fix

- Parse recovered Company Discovery JSON through a permissive structural gateway.
- Deterministically canonicalise fields before the canonical Zod schema: clip text, clamp scores, validate HTTP(S) URLs, repair match labels, and discard malformed candidates/evidence.
- Do not invent companies, URLs, evidence claims or sources.
- Preserve the existing independent official-site verification gate unchanged.
- Treat zero salvageable candidates as a valid search outcome so the existing six-pass expansion logic decides what happens next instead of classifying the response as infrastructure failure.
- Migration 0064 requeues only Company Discovery sessions terminalised by `INVALID_AI_OUTPUT` with zero saved recommendations.

## Deployment

Run `0064_genesis_g4_company_discovery_structured_output_boundary.sql`, then deploy the code.

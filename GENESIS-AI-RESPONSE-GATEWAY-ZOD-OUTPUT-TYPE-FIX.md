# Genesis AI Response Gateway — Zod Output Type Fix

## Issue
The shared gateway used a single `ZodType<T>` generic for both schema input and validated output. Schemas containing `.default()` accept optional input fields but return required output fields. TypeScript therefore inferred the pre-validation input shape at some call sites, causing compile failures such as optional `industry`/`country` values being assigned to the canonical Company Discovery result.

## Fix
The gateway now accepts `S extends ZodTypeAny` and returns `z.output<S>` from:

- `parseCandidate`
- `requestRepair`
- `parseStructuredAiResponse`

This preserves the exact validated output type of every schema and fixes the issue across all structured AI stages without casts at individual call sites.

## Behaviour
No runtime behaviour, prompts, retry logic, repair logic, token budgets, schemas, migrations or environment variables changed.

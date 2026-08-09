# MR-TI-2 Build 8.3.1 — OpenAI Strict Schema Hotfix

## Purpose
Fix the immediate HTTP 400 failure on the OpenAI Responses API for autonomous expansion, and harden the MR-TI-2 claim-repair request in the same pass.

## Changes

### Autonomous expansion
- All fields declared in the strict `evidenceJson` schema are now included in `required`.
- Semantically optional values use nullable types rather than omitted properties.
- Expansion Zod schema now mirrors the provider contract: authority, traceability, direction, lineage and derivative metadata are mandatory; nullable dates/parent lineage remain explicit nulls.
- `GenesisG82ExpansionEvidence` no longer exposes optional MR-TI-2 primitive fields.
- Expansion research version bumped to invalidate old failed/recoverable request fingerprints.
- Worker persistence now consumes the required MR-TI-2 primitives directly instead of silently applying legacy fallback values.

### Discovery repair
- Verified every observation field and relationship-hint field is required in the strict provider schema.
- Retained semantic optionality with null for source publication date and derivative parent lineage.
- Removed provider-side `format:"uri"` and redundant string-length constraints; application-side Zod remains authoritative for URL/length validation after structured parsing.
- Repair prompt/research versions bumped so old failed request checkpoints do not contaminate the corrected request path.

### Shared runtime guard
Added `lib/ai/strict-json-schema.ts`.

Before either expansion or repair can send a strict Structured Outputs request, the schema is recursively checked for:
- every object property present in `required`,
- `additionalProperties:false`,
- unknown required keys,
- nested object/array validation,
- unsupported composition keywords,
- undocumented string formats.

A future schema regression now fails locally with an explicit `OPENAI_STRICT_SCHEMA_*` error before network I/O.

## Validation
- Build 8.3.1 strict-schema validator: 25/25
- Build 8.3 legacy-eradication: 39/39
- Build 3 mathematics: 16/16
- Build 4 mathematics: 26/26
- Build 5 mathematics: 15/15
- Build 6 mathematics: 26/26
- Build 8.2 cold-start: 16/16
- Build 8.2.1 ambiguity hotfix: 8/8

No Supabase migration is required for Build 8.3.1.

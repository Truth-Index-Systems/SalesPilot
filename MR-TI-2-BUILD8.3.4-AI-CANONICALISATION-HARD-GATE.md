# MR-TI-2 Build 8.3.4 — AI Canonicalisation + Hard Gate

## Purpose
Remove the bespoke semantic parser/normaliser from Genesis G8 expansion and repair. AI owns semantic interpretation and canonicalisation; deterministic code owns only hard invariants, persistence safety and MR-TI-2 maths.

## Architecture

Research AI -> direct JSON decode -> hard acceptance gate

- Clean canonical result: persist immediately.
- Recoverable semantic/shape issue: governed resumable AI canonicalisation pass, with no web search and no new facts.
- Canonical result: hard gate -> granular persistence -> MR-TI-2.
- If AI canonicalisation fails but a safe subset exists, persist the safe subset.
- If nothing safe remains, retry research rather than inventing data.

## Removed from active G8 expansion/repair
- `parseStructuredAiResponse`
- `safeStructuredAiError`
- deterministic truncated-JSON repair
- Zod semantic parsing in expansion
- Zod semantic parsing in the repair result contract
- deterministic alias mapping / score coercion / semantic normalisation

The generic structured response gateway remains elsewhere in the wider application for unrelated older stages, but Genesis G8 expansion and repair no longer import or use it.

## AI canonicalisation rules
The canonicalisation pass:
- receives the completed research output;
- uses the same canonical strict JSON schema;
- has no web-search tool;
- may resolve harmless naming, shape, nullability, field-placement and formatting inconsistencies;
- may not add research or invent facts/sources/evidence;
- may not calculate MR-TI-2 derived values;
- is separately governed, metered and background-resumable.

## Deterministic hard gate
The remaining code checks only invariants required for safe persistence/maths, including:
- object/array presence;
- allowed entity/claim/source/direction enums;
- numeric bounds;
- valid HTTP(S) source URLs;
- lineage depth/parent consistency;
- exact repair claim/entity scope;
- missingness consistency;
- minimum safe company evidence floor.

No semantic interpretation or field coercion occurs in the gate.

## Granular persistence
- One rejected evidence item no longer aborts a company.
- One failed company no longer aborts the batch.
- Repair evidence is persisted independently.
- Expansion fails only when research found companies but zero companies can be safely persisted.

## Version fences
- Expansion research version: `G8.2-MRTI2-B8.3.4-AI-CANONICALISATION-4.0`
- Expansion scope: `genesis-g82-expansion-v4:*`
- Repair research version: `G8-MRTI2-B8.3.4-AI-CANONICALISATION-1.2`
- Old v2/v3 expansion checkpoints cannot be recovered by the new path.

## Validation
- Build 8.3.4 dedicated boundary: 20/20
- Build 8.3 legacy eradication: 39/39
- Build 3 maths: 16 invariants PASS
- Build 4 maths: 26 invariants PASS
- Build 5 maths: 15/15 PASS
- Build 6 maths: 26/26 PASS

Older validators asserting Zod/parser implementation details are superseded by Build 8.3.4 intentionally.

## Database
No Supabase migration is required for Build 8.3.4. Migration 0133 from Build 8.3.2 remains the latest required database migration.

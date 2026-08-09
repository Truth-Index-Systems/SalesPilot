# MR-TI-2 Build 8.3.3 — Expansion Output Decomposition / Anti-Truncation

## Purpose

Build 8.3.3 removes deep enrichment from the autonomous expansion response so the expansion lane can reliably complete within its structured-output budget. Expansion now owns breadth; MR-TI-2 repair owns depth.

## Production contract

One expansion call may return up to three companies. Each company contains only:

- name
- canonical domain
- sector (nullable)
- geography (nullable)
- offering (nullable, only when immediately obvious)
- customer market (nullable, only when immediately obvious)
- 2–4 company-level MR-TI-2 evidence observations

Expansion no longer requests or returns nested contacts or routes. It no longer persists contact or route entities. Downstream repair/research workers are responsible for current contacts, routes, commercial depth and other missing claims.

## Evidence boundary

Expansion evidence is restricted to the company-foundation claims:

- `identity`
- `canonical_domain`
- `current_operation`
- `industry`
- `sector`
- `geography`

The model is instructed to keep evidence excerpts at or below 280 characters. Zod retains a 420-character safety ceiling. Evidence arrays are capped at four items per company.

## Output budget

The expansion workload profile is reduced from 6,000 to 4,500 output tokens, with an evidence limit of four and context depth of four. The prompt explicitly prioritises complete compact output over richness.

The current expansion request scope is versioned as `genesis-g82-expansion-v3:*` and the completed-checkpoint recovery query only sees that prefix. Responses from the earlier larger 8.3.2 schema cannot be recovered into this build.

## Persistence behaviour

For each accepted company, expansion still:

1. upserts the canonical company entity;
2. ensures the MR-TI-2 claim contract;
3. persists the compact company evidence;
4. persists V2 evidence assessments;
5. rehydrates MR-TI-2 and appends a V2 Truth snapshot;
6. records expansion membership.

Contact and route persistence counts are intentionally zero in this lane.

## Database migration

No new Supabase migration is required for Build 8.3.3. Build 8.3.2 migration `0133` remains required and must already be applied.

## Validation

Build 8.3.3 adds `scripts/validate-mr-ti2-build8-3-3-expansion-decomposition.mjs` covering the new breadth-only boundary, output limits, v3 checkpoint fencing and worker persistence behaviour.

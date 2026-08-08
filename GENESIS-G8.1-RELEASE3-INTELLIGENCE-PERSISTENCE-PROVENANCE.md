# Genesis G8.1 Release 3 — Intelligence Persistence & Provenance Foundation

## Purpose

Release 3 gives Genesis G8 a durable, versioned persistence boundary without changing MarketRoute's frozen live Discovery Intelligence pipeline.

## Architecture

The new shared intelligence domain is deliberately organisation-neutral. It stores public commercial intelligence that can compound across MarketRoute usage. Customer-private Business DNA, campaigns, notes, outreach, replies and relationship data remain outside this domain.

The persistence chain is:

`Entity → Contract Claim → Evidence + Channel Provenance → Truth Snapshot → Human Review Receipt`

## New persistence tables

- `genesis_g8_intelligence_entities`
- `genesis_g8_intelligence_claims`
- `genesis_g8_intelligence_evidence`
- `genesis_g8_truth_snapshots`
- `genesis_g8_human_review_receipts`

All are RLS-enabled and service-role-only in Release 3. No customer-facing views are introduced yet.

## Provenance

Every evidence record stores whether it originated from:

- `KNOWLEDGE_INTELLIGENCE`
- `DISCOVERY_INTELLIGENCE`

This provenance is descriptive and auditable; it does not alter the Truth Index equation.

## Persistence semantics

Low confidence never deletes an entity. Truth Index calculations are stored as immutable snapshots. Evidence is additive, including contradictory evidence. Human review is stored as an immutable receipt.

A human `REJECT` action moves the entity to `SUPPRESSED` / `HUMAN_REJECTED`, which removes it from future active eligibility once routing is introduced, while retaining the full entity/evidence/snapshot/review history for calibration and audit.

## Production boundary

Release 3 does not import Genesis G8 into `lib/discovery`, `lib/contacts`, `lib/opportunities`, `lib/pipeline`, or `lib/autonomy`. Existing customer behaviour remains unchanged.

## Migration

`supabase/migrations/0109_genesis_g81_release3_intelligence_persistence_provenance.sql`

Run through the normal Supabase migration process. Do not manually edit existing G5 tables.

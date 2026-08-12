# MarketRoute Forensic Build 3 — SQL Compile Hotfix

## Issue

Supabase/PostgreSQL rejected migration `0153_marketroute_forensic_build3_state_invalidation_architecture.sql` with:

`ERROR 42P13: cannot change return type of existing function`

The Build-3 migration extends the OUT row types of two existing RPCs:

- `get_cie_r6_contact_authority_context(uuid, integer)` adds `r4_authority_fingerprint text`
- `get_cie_r7_research_context(uuid, integer)` adds `r4_input_fingerprint text`

PostgreSQL does not permit `CREATE OR REPLACE FUNCTION` to alter a function's OUT-parameter row type. The existing signature must be dropped and recreated.

## Repair

Migration 0153 now explicitly drops both old RPC signatures before recreating them with the Build-3 row types.

The migration was also hardened for safe rerun after a partially executed SQL-editor run by dropping the Build-3 signatures of newly introduced persistence RPCs before recreating them:

- `persist_cie_r4_commercial_reality_production(...)`
- `persist_cie_r6_contact_decision(...)`
- `replace_cie_r7_research_directives(...)`

This prevents a second run from failing with `function already exists` if earlier statements were committed before the original 42P13 failure.

## Validation

- Build-3 static authority audit: **47/47 PASS**
- Build-3 adversarial runtime: **12/12 PASS**

## Deployment

Run the corrected **entire** `APPLY-IN-SUPABASE-FORENSIC-BUILD3.sql` again. Do not run only the DROP fragments: the full migration is designed to reconcile either a fully rolled-back or partially applied first attempt.

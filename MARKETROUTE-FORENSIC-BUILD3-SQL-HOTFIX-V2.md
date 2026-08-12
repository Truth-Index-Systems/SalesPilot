# MarketRoute Forensic Build 3 — SQL Hotfix V2

## Failure corrected

Supabase returned PostgreSQL error `42P13` while changing the `RETURNS TABLE(...)` row type of `public.get_cie_r6_contact_authority_context(uuid, integer)`.

Build 3 changes the OUT row of two existing RPCs:

- `public.get_cie_r6_contact_authority_context(uuid, integer)` adds `r4_authority_fingerprint text`.
- `public.get_cie_r7_research_context(uuid, integer)` adds `r4_input_fingerprint text`.

PostgreSQL cannot alter an existing function's OUT/`RETURNS TABLE` shape with `CREATE OR REPLACE FUNCTION`.

## V2 correction

The corrected manual migration now:

1. Starts an explicit transaction.
2. Drops both changed RPC identities at the very beginning of the file, before any other Build-3 DDL.
3. Immediately verifies with `to_regprocedure(...)` that both old identities are absent.
4. Applies the idempotent Build-3 schema/state changes.
5. Recreates the two RPCs with the new row contracts using `CREATE FUNCTION`.
6. Reloads the PostgREST schema.
7. Commits only if the whole migration succeeds.

If any later statement fails, the transaction rolls back, avoiding another partially-applied Build-3 migration.

## Deployment

Run `APPLY-IN-SUPABASE-FORENSIC-BUILD3-V2.sql` in full. Do not rerun the older Build-3 SQL file.

## Verification

- Build-3 static authority audit: 47/47 PASS
- Build-3 adversarial runtime: 12/12 PASS

# SalesPilot Genesis SQL Hardening Pass

Apply `supabase/migrations/0044_genesis_sql_hardening_pass.sql` after migration `0043`.

This pass replaces live RPC definitions vulnerable to PL/pgSQL output-variable/column ambiguity and hardens database diagnostics.

## Corrected

- G1 Business Analysis claim/progress/complete/failure functions now use explicit table aliases.
- Initial Buyer Intelligence burst ledger query explicitly qualifies `campaign_id` and all usage-ledger fields.
- G4 Self Review uses `engagement_draft_reviews_draft_id_key` rather than an ambiguous `draft_id` conflict target.
- G4 Queue Builder uses `engagement_queue_holds_engagement_id_reason_code_key` for all hold upserts.
- Existing Commercial Reasoning and Outreach Generation claim fixes remain included.
- Failed PostgREST requests now log the method, safe request path, HTTP status and PostgreSQL response details without logging credentials or request bodies.

## Commands

```bash
npm run sql:hardening-check
npm run typecheck
npm run build
```

No test mode or production throttling is introduced.

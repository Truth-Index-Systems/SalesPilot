# MarketRoute G5.1.5 — Anonymous Governance Identity Fix

## Root cause
Anonymous Business Analysis was identified twice: once at the public API boundary and again during job creation. A stale or divergent Supabase session could therefore attach an organisation to a complimentary analysis job. The AI governance layer then correctly routed that job through workspace governance and returned `AI_GOVERNANCE_BLOCKED:AUTONOMY_DISABLED`.

## Fix
- The public API makes the anonymous/authenticated decision once and passes it explicitly into job creation.
- Anonymous jobs are persisted with `organisation_id = null` and `requested_by = null`.
- `requested_by = null` becomes the durable public-analysis identity used by the worker.
- Business Analysis forwards an explicit `publicAnalysis` flag into AI governance.
- AI governance prefers that explicit flag over inference from organisation state.
- Migration `0099_marketroute_g515_anonymous_governance_identity_fix.sql` is self-contained and re-declares the public reservation RPC plus monotonic Business Analysis progress/retry RPCs.
- The campaign wizard no longer lets a stale local stage checklist appear ahead of persisted percentage progress after a failed attempt.

## Deployment
Apply migration `0099_marketroute_g515_anonymous_governance_identity_fix.sql`, then deploy the application.

Existing failed anonymous jobs created with an organisation ID should be considered tainted by the old ownership decision. Start a fresh complimentary analysis after deployment. During pre-launch testing, clear the `mr_anon_visitor` cookie if the browser's complimentary allowance was exhausted by these failed test attempts.

# MarketRoute G5.1.4 — Public Analysis Governance + Truthful Progress

## Root cause fixed
Anonymous Business Analysis jobs intentionally have no organisation. The normal workspace AI governance RPC requires an organisation and therefore rejected the public trial path with `AI_GOVERNANCE_BLOCKED:ORGANISATION_REQUIRED` before any OpenAI call.

## Changes
- Adds a dedicated atomic AI reservation lane for anonymous `BUSINESS_ANALYSIS` only.
- Keeps the deployment-wide `MARKETROUTE_AI_PLATFORM_ENABLED` gate intact.
- Records anonymous AI usage in `ai_usage_ledger` with `organisation_id = null` for cost accounting.
- Adds environment-controlled global public caps:
  - `MARKETROUTE_PUBLIC_AI_DAILY_REQUEST_LIMIT` (default 100)
  - `MARKETROUTE_PUBLIC_AI_DAILY_COST_LIMIT_USD` (default 10)
  - `MARKETROUTE_PUBLIC_AI_IN_FLIGHT_LIMIT` (default 8)
- Does not alter workspace/campaign AI governance.
- Preserves Business Analysis progress across retry/background reclaims instead of resetting 52% back to 0/8%.
- The UI percentage continues to come from the persisted Business Analysis job, not an animation timer.

## Migration
Apply `supabase/migrations/0098_marketroute_g514_public_analysis_governance_and_progress.sql`.

Existing G5.1.3 jobs in `FAILED_RETRYABLE` can resume after this migration/deployment without creating a new anonymous analysis or consuming another complimentary entitlement.

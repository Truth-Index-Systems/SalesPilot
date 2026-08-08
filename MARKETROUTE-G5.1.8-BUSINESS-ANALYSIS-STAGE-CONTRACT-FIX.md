# MarketRoute Genesis G5.1.8 — Business Analysis Stage Contract Fix

## Root cause

G5.1.6/G5.1.7 introduced truthful persisted Business Analysis stages, but the original `business_analysis_jobs_stage_check` constraint still accepted only the legacy S6 stage vocabulary. Supabase therefore rejected the first transition to `BUILDING_BUSINESS_DNA` with PostgreSQL error `23514`.

## Fix

Migration `0101_marketroute_g518_business_analysis_stage_contract_fix.sql` replaces the stage check constraint and allows the complete current state vocabulary:

- `WEBSITE_CONNECTED`
- `BUILDING_BUSINESS_DNA`
- `BUSINESS_DNA_READY`
- `GROWTH_STRATEGY_RUNNING`
- `PREPARING_RECOMMENDATIONS`

Legacy values remain accepted so persisted/in-flight jobs from older deployments are not invalidated.

## Deployment

Apply migration `0101` in Supabase, then deploy this build. No data reset is required. A retryable job that previously failed on the constraint can be reclaimed after the migration; for clean UX testing a new anonymous analysis is still preferable.

## Scope

No AI prompt, governance, website reader, retry, or downstream Business DNA contract changes are included. This is a schema/runtime contract alignment only.

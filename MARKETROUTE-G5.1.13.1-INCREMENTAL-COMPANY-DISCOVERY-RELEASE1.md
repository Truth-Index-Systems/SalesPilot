# MarketRoute Genesis G5.1.13.1 — Incremental Company Discovery, Release 1

## Purpose
Reduce perceived time to first market results without weakening the existing official-evidence gate or downstream opportunity quality.

## What changed
- Search planning is now exposed as durable `SEARCH_PLAN_RUNNING` → `SEARCH_PLAN_READY` progress.
- The active archetype enters `BREADTH_DISCOVERY` before evidence verification.
- GPT breadth candidates are persisted immediately to `company_discovery_candidates`.
- The campaign live feed can show candidate company names and counts while official evidence checks continue.
- Candidates transition to `VERIFIED` or `HELD`; only verified companies continue into the canonical `companies` table.
- Candidate/timeline writes are ownership-fenced and resumable.

## What did not change
- Company fit schema and GPT research quality.
- Official-site evidence verification thresholds.
- Canonical company persistence contract.
- G5.1.11 archetype cursor authority.
- Route Intelligence, Contact Discovery, opportunity scoring, or engagement logic.

## Deployment
Apply:

`supabase/migrations/0105_marketroute_g51131_incremental_company_discovery_release1.sql`

Then deploy the application bundle.

## Expected founder experience
`Building your market search strategy` → `Searching your market` → candidate company names/counts appear → `Companies discovered · checking evidence` → verified recommendations appear progressively.

The staging layer is intentionally not treated as a recommendation surface. A discovered candidate is only a market lead until the existing evidence gate promotes it into the canonical company table.

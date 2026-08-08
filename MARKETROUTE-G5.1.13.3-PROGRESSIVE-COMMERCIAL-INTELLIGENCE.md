# MarketRoute Genesis G5.1.13.3 — Progressive Commercial Intelligence

## Purpose
Make the first expensive route/contact reasoning work on the strongest verified companies first, without removing lower-ranked verified accounts or weakening final opportunity coverage.

## What changed
- Added a deterministic, evidence-aware `commercial_priority_score` (0–100) and A/B/C tier to verified companies.
- Priority uses the already-produced fit breakdown, discovery confidence, evidence quality, uncertainties and risk flags. No additional AI call is required.
- Priority is persisted only after a company has passed the official evidence gate and entered the canonical `companies` table.
- Pass-0 Route Intelligence / contact discovery now claims the highest-priority verified company first.
- `plan_contact_discovery_dispatch` uses the identical ordering so planner and claimant remain aligned.
- Existing depth-focus/route-expansion ordering is unchanged.
- Tier B/C companies remain fully eligible after stronger companies, preserving final quality and breadth.
- Existing companies are backfilled to a neutral compatibility priority derived from discovery confidence.

## Deployment
Apply `supabase/migrations/0107_marketroute_g51133_progressive_commercial_intelligence.sql`, then deploy the application.

## Expected behaviour
The first routes/opportunities should emerge from the strongest evidence-backed accounts sooner. MarketRoute still researches lower-ranked verified companies afterwards when capacity remains, so this is progressive prioritisation rather than destructive filtering.

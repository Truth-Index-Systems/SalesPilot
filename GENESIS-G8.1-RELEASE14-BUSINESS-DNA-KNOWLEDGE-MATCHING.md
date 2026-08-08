# Genesis G8.1 Release 14 — Business DNA → Knowledge Matching

## Purpose
Activate the first read-only customer entry point into Genesis Knowledge Intelligence.

After the canonical Business DNA has been assembled, MarketRoute now asks the R13 retrieval engine for already-known companies before exposing the completed analysis. The result is persisted privately on the durable business-analysis job so the next release can merge those candidates into customer workflow without repeating retrieval.

## Constitutional boundaries

- Business DNA remains the canonical seller/customer-understanding layer.
- The shared G8 graph remains organisation-neutral and evidence-backed.
- Business DNA is never copied into shared G8 intelligence.
- Business Fit remains customer-specific and does not alter Truth Index.
- Knowledge matching is an accelerator, never a prerequisite for Business DNA completion.
- Existing Discovery Intelligence remains the universal fallback path.
- R14 does not create companies, contacts, routes, opportunities, campaigns, outreach, or discovery sessions.

## Activation safety

`GENESIS_G8_BUSINESS_DNA_KNOWLEDGE_MATCHING=false` disables the R14 activation point without removing any G8 persistence or retrieval infrastructure.

`GENESIS_G8_BUSINESS_DNA_MATCH_TIMEOUT_MS` controls the bounded read-only retrieval budget and defaults to 2500ms (clamped 500–10000ms).

A timeout, empty result, missing R13 projection, missing R14 migration, or other non-ownership G8 error is fail-open: the Business DNA job still completes and legacy Discovery remains available.

## Persistence

Migration `0116_genesis_g81_release14_business_dna_knowledge_matching.sql` adds private match state to `business_analysis_jobs` plus worker-token-fenced RPCs. The persisted match snapshot contains only ranked candidate summaries needed by later merge logic. It deliberately excludes R13 search text, claim corpora, raw evidence excerpts, and the customer's Business DNA.

## Resumability

A completed match is durable. If the Business Analysis worker is later reclaimed before final completion, it does not repeat the same completed knowledge query.

## Customer API

The existing protected Business Analysis status endpoint exposes `knowledgeMatchStatus` and, when complete, the private match snapshot. Existing clients ignore the additive fields safely. No new public route or cron is introduced.

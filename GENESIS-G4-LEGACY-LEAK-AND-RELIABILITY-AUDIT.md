# Genesis G4 Legacy Leak & Reliability Audit

## Scope

Audited the active Next.js runtime, autonomous scheduler, Company Discovery state machine, Route Research, Engagement workers, website-analysis job lifecycle, public API error boundaries, refresh behaviour, customer terminology, package contents, and historical compatibility assets.

## Important fixes applied

1. Removed the obsolete global `window.fetch` monkey-patch (`ApiLifecycleRefresh`). The database-state watcher is now the single source of campaign refresh behaviour.
2. Removed the token-bearing GET status route for website analysis. Job capability tokens are now sent in a POST body and no longer appear in URLs, browser history, referrers, or Vercel query logs.
3. Changed website-analysis capability storage from persistent `localStorage` to session-scoped `sessionStorage`, and remove the old persistent key on load.
4. Added `Cache-Control: no-store` and `Referrer-Policy: no-referrer` to the analysis status boundary.
5. Sanitised Company Discovery, Route Research, Engagement Generation, AI Review, and Business Analysis failure reasons before database persistence.
6. Prevented the engagement-outcome API and internal observation endpoint from returning raw database or exception messages.
7. Removed dead lifecycle-event dispatches left behind after the global refresh layer was retired.
8. Removed an unused legacy `DiscoveryResponse` type and the generated TypeScript build cache.
9. Removed remaining customer-facing engine terminology such as “Buyer Intelligence”, “Contact Discovery”, “Opportunity Intelligence active”, and “the scheduler”.
10. Updated the former API-lifecycle validator to validate the new database-state refresh architecture rather than requiring deleted legacy code.

## Deliberately retained

- Historical SQL migrations: required to reconstruct a fresh database in order.
- Older regression validators: required to ensure frozen Genesis behaviour remains compatible.
- Tombstone routes for the retired independent discovery executors: these return 409 and prevent accidental competing worker dispatch. They do not execute work.
- Canonical legacy-state translation in `lib/pipeline/presentation.ts`: required to present existing rows created by earlier migrations safely.
- SQL compatibility wrapper `record_company_discovery_failure`: required for older database callers while all current runtime code uses the v2 function.

## Validation

Passed:

- `genesis:g4-legacy-audit-check`
- `genesis:g4-discovery-state-check`
- `genesis:g4-search-order-check`
- `genesis:g4-api-refresh-check`
- `genesis:g4-route-claim-check`
- `genesis:g4-route-expansion-check`
- `genesis:ai-gateway-check`
- `genesis:g465-check`

The TypeScript parser found no syntax-class errors. A complete dependency-backed Next.js build could not run in the packaging environment because its npm mirror does not contain the locked `zod@3.24.2` tarball.

## Migration

No new SQL migration is required for this audit release.

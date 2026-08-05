# Genesis G2 Build Report

## Delivered

- Automatic discovery-session creation from `CampaignCreated`.
- Backfill queue for existing approved `PREPARING` campaigns.
- Cron-driven, idempotently claimed discovery worker.
- OpenAI Responses-based public-web company research with strict structured output.
- Evidence and uncertainty requirements for every recommendation.
- Tenant-owned company, version and evidence records.
- Atomic recommendation persistence and campaign completion update.
- Customer-visible campaign progress and timeline completion entry.
- Persisted Companies list, filters and detail pages.
- Company approval, rejection and archival API.
- Live company totals in the overview and workspace sidebar.
- Tenant-scoped read policies and no customer access to worker functions.

## Intentionally excluded

- Contact discovery.
- Email generation.
- Sending.
- LinkedIn automation.
- CRM synchronisation.
- Reply intelligence.
- Opportunity automation.

## Verification completed in this environment

```text
npm run g2:check
npm run genesis:check
npm run campaigns:check
```

The static validation checks passed. `npm ci`, TypeScript verification and the production build could not run because the execution environment's package mirror returned HTTP 404 for the project's existing pinned `zod@3.24.2` package. Run the complete build in the normal local/Vercel environment before deployment.

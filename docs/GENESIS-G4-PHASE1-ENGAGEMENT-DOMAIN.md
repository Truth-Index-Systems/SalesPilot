# SalesPilot Genesis G4 Phase 1 — Engagement Domain

## Delivered

- Extended the frozen G3.5 Opportunity → Engagement bridge rather than replacing it.
- Added first-class Engagement types, validators, mapper, repository and thin service orchestration.
- Added tenant-scoped create, load, update, status and history operations.
- Added generation history, prompt version and review history repositories at database level for later G4 phases.
- Added `generation_version`, `prompt_version`, `engagement_score` and `confidence` fields without generating any outreach.
- Added an idempotent controlled creation RPC with membership, approved-opportunity and AI-governance checks.
- Preserved the single scheduler as the normal owner of automatic Engagement creation.
- Added `EngagementCreated` outbox and `ENGAGEMENT_CREATED` customer timeline events for controlled service creation.
- Preserved the existing route-aware `READY_FOR_DRAFT` / `NEEDS_ROUTE` bridge behaviour.

## Migration

Run after migration `0032`:

`supabase/migrations/0033_genesis_g4_phase1_engagement_domain.sql`

Do not run migrations automatically from application code.

## Validation

```bash
npm run genesis:g4-phase1-check
npm run typecheck
npm run build
```

## Explicitly Not Included

- OpenAI calls
- Commercial reasoning
- Outreach generation
- Self-review
- Sending or scheduling
- Navigation redesign
- Replacement of Company, Contact, Opportunity, scheduler or governance repositories

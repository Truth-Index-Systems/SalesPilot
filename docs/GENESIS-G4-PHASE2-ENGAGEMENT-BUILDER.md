# MarketRoute Genesis G4 Phase 2 — Engagement Builder

## Status

Complete.

## Scope

Phase 2 formalises approved-opportunity discovery as a scheduler-owned Engagement Builder. It extends the frozen G3.5 bridge and G4 Phase 1 domain; it does not replace either.

## Behaviour

For every scheduler cycle, MarketRoute now:

1. Runs opportunity foundation and scoring.
2. Invokes exactly one Engagement Builder execution for the scheduler run.
3. Finds approved opportunities through the frozen bridge.
4. Creates at most one engagement per organisation, campaign and opportunity.
5. Assigns `READY_FOR_DRAFT` when a supported route exists, otherwise `NEEDS_ROUTE`.
6. Reuses existing history, customer timeline and `EngagementCreated` outbox behaviour.
7. Records the builder result internally for retry and operational diagnosis.

## Ownership and retries

`engagement_builder_runs` has a unique scheduler-run constraint. `run_engagement_builder` also takes a transaction-scoped advisory lock. Repeating the same scheduler run returns its completed result and cannot duplicate engagements.

## Boundary

No OpenAI request, commercial analysis, draft generation, review, approval, sending or sending-window logic is introduced in Phase 2.

## Migration

Apply after migrations 0032, 0033 and the G3 contact-foundation hotfix 0034:

```text
supabase/migrations/0035_genesis_g4_phase2_engagement_builder.sql
```

## Validation

```bash
npm run genesis:g4-phase2-check
npm run typecheck
npm run build
```

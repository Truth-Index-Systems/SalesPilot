# MarketRoute Genesis G5.1.9 — Hardening & Legacy Code Audit

## Scope

A surgical release-hardening pass over the G5.1.8 source, with particular attention to Business Analysis orchestration, anonymous analysis entitlement, background AI resumability, stage authority, old SalesPilot-era runtime paths, scheduler ownership, and rebrand residue.

## Findings

### Business Analysis execution authority
- Confirmed there is one live persisted Business Analysis worker.
- Confirmed Core Business DNA -> Growth Strategy is the only live decomposed execution path.
- Removed the unused `analyseBusiness()` compatibility wrapper, which could otherwise reintroduce a non-checkpointed Core+Growth path if imported later.
- Added a typed `BusinessAnalysisStage` runtime vocabulary so new stage names cannot be casually introduced as arbitrary strings.

### Anonymous entitlement correctness
- Fixed a real accounting defect: complimentary usage was previously consumed before durable job creation.
- Anonymous jobs are now persisted first; entitlement is committed only after a durable job exists.
- If entitlement/IP safety rejects the request, the still-QUEUED anonymous job is deleted through a narrowly fenced RPC.
- If startup fails after job creation, the orphan QUEUED job is also cleaned up.
- IP safety is checked before visitor entitlement so an IP-level rejection cannot consume one of the visitor's three complimentary analyses.

### Legacy Business Analysis mutation surface
- G4.7.10 had already revoked service-role execution of the original S6 mutation RPCs.
- G5.1.9 drops those superseded RPCs completely:
  - `update_business_analysis_progress(...)`
  - `complete_business_analysis_job(...)`
  - `fail_business_analysis_job(...)`
- The worker-token-fenced `_owned` RPCs remain the sole Business Analysis mutation authority.

### Background AI / 72% behaviour
- No competing legacy Business Analysis worker was found.
- Growth Strategy at 72% correctly uses the durable OpenAI background-response path.
- `lib/ai/background-response.ts` remains the sole active provider transport owner.
- Completion retrieval remains owned by webhook/collector; Business Analysis workers consume cached completed responses and do not poll provider work themselves.
- R1-R5 resumability, collector ownership, parallelism, workload and observability invariants remain intact.

### Legacy validation drift
- Updated the G4.7.10 full-pipeline audit to validate the current R3/R5 generic scheduler wall-clock budget guard instead of the retired `ROUTE_INTELLIGENCE_START_BUDGET_MS` constant.
- No production scheduler behaviour was changed.

### Rebrand residue
- SMTP `EHLO salespilot` -> `EHLO marketroute`.
- SMTP fallback Message-ID domain `salespilot.local` -> `marketroute.local`.
- Founder dashboard now issues `marketroute_founder_dashboard`; existing `salespilot_founder_dashboard` sessions are accepted temporarily for migration continuity and both are cleared on logout.

## Intentionally retained compatibility identifiers

The following SalesPilot-era identifiers were deliberately not renamed because they are durable compatibility contracts rather than user-facing branding:
- existing database RPC names such as `review_salespilot_*` and `control_salespilot_campaign`;
- historical local/session storage keys used to preserve in-progress campaign drafts and idempotency;
- AI prompt/cache keys, where renaming would unnecessarily destroy cache identity;
- legacy environment-variable fallbacks used by deployed infrastructure;
- `/salespilot-logo.png` compatibility asset for cached crawlers/old image optimiser requests.

Changing those identifiers in a release-hardening pass would add migration/regression risk without customer-facing benefit.

## Migration

Apply:

`supabase/migrations/0102_marketroute_g519_business_analysis_hardening_and_legacy_audit.sql`

This migration removes the three superseded unfenced Business Analysis mutation functions and adds the narrowly-scoped anonymous QUEUED-job cleanup RPC.

## Validation

Passed:
- MarketRoute G5.1.9 hardening/legacy audit
- MarketRoute G5.1.8 stage contract
- MarketRoute G5.1.6 Business Analysis decomposition
- Speed R1 timeout elimination
- Speed R2 event-driven completion
- Speed R3 controlled parallelism
- Speed R4 workload optimisation
- Speed R5 latency observatory
- All-AI background resumability
- Genesis G4.7.10 full-pipeline legacy/leak audit after updating its stale scheduler assertion
- Syntax transpilation checks for every modified TypeScript file

A full project `tsc --noEmit` could not be used as a meaningful compile gate in this sandbox because the uploaded ZIP does not contain `node_modules`; TypeScript therefore reports missing Next, React, Zod and Node type declarations across the existing project. No dependency versions were changed.

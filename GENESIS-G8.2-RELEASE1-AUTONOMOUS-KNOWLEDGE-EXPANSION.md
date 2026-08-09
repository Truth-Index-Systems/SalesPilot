# Genesis G8.2 Release 1 — Autonomous Knowledge Expansion Activation

## Purpose
G8.1 V1 could ingest customer Discovery and repair knowledge it already owned, but it deliberately did not schedule its G8 workers or discover brand-new public entities without customer demand. G8.2 R1 closes that operational gap without reopening the frozen Truth architecture.

## Operating model
A single protected `/api/autonomy/genesis-g8/operate/run` heartbeat is scheduled once per minute alongside the existing OpenAI collector and legacy pipeline cron. Each heartbeat:

1. drains existing Discovery acquisition events into the shared graph;
2. drains durable Truth replans;
3. reads the R17 capacity governor;
4. services exact repair work, with customer-scoped repairs first;
5. when spare governed background capacity exists, schedules bounded freshness refreshes;
6. executes at most one autonomous industry-expansion work unit.

Customer demand disables speculative expansion immediately. The existing AI governance policy remains the hard request/cost ceiling.

## Autonomous expansion
Ten initial target industries are seeded: Software & SaaS, Professional Services, Marketing & Advertising, Recruitment & HR, Finance & FinTech, Healthcare & HealthTech, Retail & E-commerce, Manufacturing, Logistics & Supply Chain, and Construction & PropTech.

One expansion work unit asks AI for at most three new companies in one industry, up to two verifiable public contacts per company, and one verifiable public route per company. AI returns evidence only. It cannot set Truth Index, confidence, coverage, approval, opportunity quality or workflow state.

All returned public intelligence is persisted through the canonical G8 entity/claim/evidence repository with `DISCOVERY_INTELLIGENCE` provenance, then rehydrated through the frozen `MR-TI-1.0` Truth Kernel.

## Spend safety
Expansion deliberately shares the existing `GENESIS_G8_REPAIR` governance lane in R1. Migration 0123 extends the R17 budget snapshot so expansion usage consumes the same background-growth allowance rather than creating a new hidden budget.

## Persistence
New service-role-only tables:
- `genesis_g82_expansion_targets`
- `genesis_g82_expansion_membership`
- `genesis_g82_expansion_jobs`

Expansion jobs are durable, leased with `FOR UPDATE SKIP LOCKED`, resumable through the existing background-response collector, and idempotent at the canonical G8 entity boundary.

## Deployment
Run migration `0123_genesis_g82_release1_autonomous_knowledge_expansion.sql` before relying on the new heartbeat. The existing `CRON_SECRET`, `OPENAI_API_KEY`, `MARKETROUTE_G8_SYSTEM_ORGANISATION_ID`, AI platform enablement and governance policy remain required.

No G8.1 Truth equation or customer Discovery state machine is redesigned by this release.

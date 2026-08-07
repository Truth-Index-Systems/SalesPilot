# Genesis G4.7.8 — Route Intelligence Dispatch Fairness

## Root cause

G4.7.4 correctly stopped starting Route Intelligence late in a Vercel invocation, but the scheduler still always ran Company Discovery first. Once Company Discovery replenishment became autonomous, a long company-search pass could consume the route-start budget every cron cycle. Route Intelligence remained queued without throwing, so there were no worker errors to diagnose.

The legacy initial-contact-burst planner also mutated `campaigns.initial_contact_burst_completed_at` while merely planning dispatch. If the scheduler then deferred Route Intelligence for execution-budget reasons, the campaign could be recorded as having consumed its initial burst even though no route worker was claimed.

## G4.7.8 contract

Approved-company Route Intelligence is customer-committed work and outranks speculative company replenishment.

1. Recover and prepare durable work.
2. Sync Route Intelligence foundations.
3. Read-only plan for one due Route Intelligence job.
4. If a route is due, give it the heavyweight execution window for this cron cycle.
5. Do not run Company Discovery in the same heavyweight cycle.
6. If no route is due, Company Discovery receives the heavyweight window.
7. Cheap opportunity/engagement assembly may continue when the safety reserve permits.

This does not modify Company Discovery search, evidence, scoring, expansion or review logic.

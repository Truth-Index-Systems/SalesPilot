# Genesis G4.7.4 — Scheduler Execution Budget Hardening

## Root cause
The production pipeline route has a 300-second Vercel hard limit, but `runPipelineScheduler()` previously chained every eligible stage without considering elapsed wall-clock time. A long Company Discovery verification pass could finish successfully near the end of the invocation and the scheduler would still claim Route Intelligence. Vercel then terminated the function before the newly claimed worker could complete, producing `FUNCTION_INVOCATION_TIMEOUT` despite the previous stage succeeding.

## Fix
- Added a 25-second scheduler safety reserve for outcome persistence and lease release.
- Route Intelligence is only claimed when at least 245 seconds of scheduler execution budget remain, matching its deep first-pass abort envelope plus safety margin.
- If Company Discovery finishes inside the safety reserve, the scheduler records the completed company outcome and exits cleanly; the next cron resumes from durable state.
- Cheap opportunity/engagement foundation work may continue while budget remains.
- 120-second Engagement AI workers only start when at least 130 seconds remain.
- No Company Discovery search, evidence, verification, scoring, expansion, or replenishment behaviour was changed.

## Expected production behaviour
A long Company Discovery run now ends with HTTP 200/207 and releases the scheduler lease. Route Intelligence remains queued and is claimed by the next cron invocation with a fresh execution window instead of being started seconds before the platform deadline.

No SQL migration is required.

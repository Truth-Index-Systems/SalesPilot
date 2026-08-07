# Genesis G4.7.5 — Route Intelligence Ownership Fencing

## Root cause

A Route Intelligence worker could be healthy and still lose its session after the AI call because session mutation RPCs were keyed only by `session_id`. A stale worker from an earlier scheduler invocation could therefore record a failure against a session that had already been reclaimed by a newer scheduler run. The new worker would return from research and receive `contact discovery session is not running` on its next progress write.

The global scheduler lease also remained at the historical 240-second default while the Vercel function now has a 300-second execution window and G4.7 research can legitimately run for several minutes.

## Fix

- Scheduler lease is explicitly acquired for 290 seconds while the scheduler itself still exits within its 275-second safe execution budget.
- Added scheduler-run ownership fencing for every Route Intelligence persistence boundary used by the worker.
- Progress, route snapshots, company channels, contacts, readiness, completion, finalisation and failure writes now require the same `scheduler_run_id` that claimed the session.
- Stale workers cannot mark a newer run failed or persist stale route research.
- A superseded worker exits benignly with `SUPERSEDED` instead of creating another retry loop.

## Migration

Apply `0068_genesis_g475_route_intelligence_ownership_fencing.sql`.

## Frozen areas

No Company Discovery planning, search, evidence verification, scoring, expansion, review or replenishment logic changed.

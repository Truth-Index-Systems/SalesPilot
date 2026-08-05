# Genesis Stabilisation S9 — Automated Test Matrix

S9 adds a deterministic, dependency-free test harness for the autonomous pipeline. It does not call OpenAI, Supabase, Vercel, or external websites and therefore cannot consume API credit.

## Unit coverage

- Canonical job transitions and illegal transitions
- Retry backoff and maximum attempts
- Rate-limit minimum delay
- No-result cooldown progression
- Deterministic campaign-stage derivation

## Integration coverage

- Initial campaign creates one company-discovery job
- Concurrent scheduler invocation cannot acquire the scheduler lock
- Company approval creates exactly one contact-discovery job
- Repeated scheduler cycles cannot duplicate active work
- Expired leases recover and misleading progress is cleared
- No-result cycles enter cooldown without timeline spam
- Paused and archived campaigns create no work
- A failed contact job does not block a later queued company

## Soak coverage

The default soak harness runs 500 deterministic scheduler cycles with mixed outcomes:

- Success
- No results
- Network failure
- Rate limit
- Worker interruption and lease recovery
- Campaign pause and resume
- Company queue depletion and top-up

The test fails on:

- Duplicate active jobs
- Illegal state transitions
- Duplicate timeline events
- Expired running leases
- 40% progress outside a running job

Run a larger local soak with:

```powershell
$env:SALESPILOT_SOAK_CYCLES=5000
npm run stabilisation:s9-soak
```

## Commands

```powershell
npm run stabilisation:s9-unit
npm run stabilisation:s9-integration
npm run stabilisation:s9-soak
npm run stabilisation:s9-check
```

The simulator complements, rather than replaces, S10 production observation against the real database and deployed scheduler.

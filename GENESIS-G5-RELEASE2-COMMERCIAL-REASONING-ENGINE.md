# MarketRoute Genesis G5 — Release 2
## Commercial Reasoning Engine

Release 2 is built directly on the compiled G5 Release 1 ZIP.

### Frozen boundary
G4 remains immutable. Release 2 reads the approved Opportunity contract and its existing Business DNA, campaign strategy, company/contact evidence, Route Intelligence, organisation map, buying paths and commercial routes. It does not update any G4-owned entity.

### Canonical flow
`WAITING -> REASONING -> STRATEGY_READY`

The Release 1 ownership fence remains authoritative. A worker must hold the active scheduler run and matching lease token both when reading the G4 context and when committing the reasoning result. A stale worker cannot commit.

### Persisted commercial reasoning
The strategy now stores a strict `g5-commercial-reasoning/v1` object covering:
- why this company
- why this route
- why now
- primary problem
- commercial consequence
- credible outcome
- entry proposition
- smallest reasonable commitment
- likely objection and response principle
- safe evidence references
- prohibited claims
- commercial inferences
- limitations
- reasoning confidence and summary

The exact compacted G4 snapshot consumed by the model and its SHA-256 fingerprint are persisted for auditability and reproducibility.

### Legacy execution cut
The old G4-era scheduler path for commercial reasoning, outreach generation, self-review and send queue is no longer executed. G5 now owns engagement intelligence beyond the approved Opportunity boundary. Release 2 deliberately stops at `STRATEGY_READY`; channel selection and message generation remain future controlled releases.

### Migration
Apply `supabase/migrations/0075_genesis_g5_release2_commercial_reasoning_engine.sql` after Release 1 migration 0074.

### Validation
Run `npm run genesis:g5-release2-check` and then the normal production build.

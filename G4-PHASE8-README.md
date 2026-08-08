# MarketRoute Genesis G4 Phase 8 — Learning & Versioning

Final G4 phase. Adds immutable engagement learning snapshots, prompt/model version metadata, aggregate metrics, timeline/history and outbox events. It introduces no AI calls, sending, dispatch or customer workflow changes.

Apply `supabase/migrations/0041_genesis_g4_phase8_learning_versioning.sql` after `0040`, then run:

```bash
npm install
npm run genesis:g4-phase8-check
npm run typecheck
npm run build
```

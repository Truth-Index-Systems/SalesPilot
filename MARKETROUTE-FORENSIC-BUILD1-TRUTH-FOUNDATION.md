# MarketRoute Forensic Build 1 — Truth Foundation Repair

Status: **BUILT / NOT FROZEN**

This build repairs the epistemic foundation identified by the August 12 forensic audit. It deliberately does not touch route authority, contact authority, R4 production wiring, opportunity state transitions, or the Founder Command Centre read model. Those remain subsequent forensic builds.

## Constitutional changes

### 1. Evidence strength is no longer called probability

Production MR-TI now separates:

- `evidenceBalance`: direction of represented evidence. **Not probability.**
- `evidenceSufficiency`: quantity of effective represented evidence, independent of direction.
- `truthProbability`: nullable and legal only after empirical monotonic calibration.
- `probabilityState`: `UNCALIBRATED` or `EMPIRICALLY_CALIBRATED` at claim level.

The previous `calculateMrTi2RawClaimProbability` path is removed from the live Truth implementation.

### 2. Production and CIE use one shared epistemic primitive

`lib/truth-foundation/epistemic.ts` is now the shared definition for:

- independent evidence compounding,
- evidence balance,
- evidence sufficiency,
- PAV isotonic empirical calibration.

The duplicate CIE `0.1.0-shadow` truth calculus has been replaced by a compatibility adapter over the shared foundation. CIE no longer carries a second definition of truth mathematics.

### 3. Freshness evolves with time

Freshness now uses:

`freshness origin -> evaluation reference time`

rather than:

`source publication -> ingestion observation time`

A single reference time is established for an entity calculation and passed through every evidence primitive and snapshot.

Undated sources use `observedAt` as a conservative known temporal origin and are explicitly marked `sourcePublicationKnown=false`. They decay after observation rather than remaining permanently fresh.

### 4. Dependent evidence no longer freely compounds

Production hydration resolves an evidence dependence family from `source_lineage_key` and derivative ancestry.

Within one dependence family, evidence collapses to the strongest representative. Only distinct families compound.

This prevents copied, syndicated, or derivative observations from manufacturing confidence through duplicate noisy-OR compounding.

### 5. Confidence is separated from belief direction

Entity `evidenceSufficiency` is a weighted mean of represented claim evidence sufficiency.

The existing `representedConfidence` field remains only as a compatibility mirror of evidence sufficiency because current SQL/RPC surfaces still expose that legacy schema name. It must not be interpreted as truth probability.

### 6. Snapshot semantics are versioned

New snapshots carry:

- `truth_semantics_version = MR-TI-2-TFR1`
- `evidence_sufficiency`
- `calibrated_probability_coverage`
- `probability_state`

Historical snapshots are not rewritten and remain identifiable as legacy semantics.

### 7. SQL probability helper now fails closed

`mrti2_result_claim_probability(...)` returns a value only when the contribution explicitly contains an empirically calibrated `truthProbability`.

A separate `mrti2_result_claim_evidence_balance(...)` helper exists for read-model compatibility where directional evidence balance is actually intended.

## Deployment order

1. Apply `supabase/migrations/0151_marketroute_forensic_build1_truth_foundation.sql`.
2. Deploy the Build 1 application source.
3. Allow active entities to be recalculated/hydrated so new TFR1 snapshots supersede legacy snapshots naturally.

Do **not** deploy the application code before migration 0151 because the new snapshot writer persists the added epistemic metadata columns.

## Verification performed

- Forensic Build 1 static authority checks: **14/14 PASS**
- Forensic Build 1 adversarial Truth invariants: **11/11 PASS**
- Existing CIE-R2 adversarial suite: **8/8 PASS**
- Existing CIE-R3 adversarial suite after shared-foundation promotion: **10/10 PASS**
- Existing CIE-R4 adversarial suite after shared-foundation promotion: **10/10 PASS**
- Pure Truth / CIE TypeScript modules: strict targeted type compilation **PASS**
- Changed production hydration/snapshot/hydration server modules: strict targeted TypeScript typecheck **PASS**

A full `next build` could not be executed in the audit container because the uploaded source archive does not contain installed Next/React dependencies and the container has no npm package cache. The changed mathematical and server modules were independently strict-typechecked instead.

## Adversarial behaviours now proven

- freshness decreases as reference time advances;
- undated evidence does not remain fresh forever;
- anomalous future publication timestamps cannot make evidence younger than observation;
- copied evidence in one lineage family does not compound;
- independent families may compound;
- weak positive evidence remains weak positive evidence and does not become a negative CE-style force by being mislabelled probability;
- symmetric conflict can have high evidence sufficiency while evidence balance is neutral;
- no truth probability is emitted without empirical calibration;
- dependency propagation is explicitly operating on evidence balance rather than a falsely-labelled probability;
- entity evidence sufficiency is mathematically independent from directional Truth Index;
- CIE and production MR-TI share one epistemic implementation.

## Explicitly unresolved after Build 1

This build is **not a re-freeze**. The following forensic findings remain open by design:

- live Commercial Reality / R4 producer wiring;
- seller constraint -> target Truth -> CE-R2 production composition;
- AI-supplied numeric relationship strength authority;
- R4/R6 state regression (`READY` / `NEEDS_EVIDENCE` reset risk);
- G4 weighted `commercial_routes.is_viable` authority contamination;
- canonical 9D relationships not yet driving live multi-hop route calculus;
- R6 legacy binary contact evidence gates;
- authoritative CIE read model / Founder Command Centre provenance;
- legacy authority quarantine and final constitutional CI.

Build 2 should begin from this archive and treat `MR-TI-2-TFR1` as the only valid new Truth semantics.

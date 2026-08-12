# MarketRoute — Forensic Build 2: Live Commercial Reality Producer

**Status:** PASS — production candidate, **not frozen**  
**Producer version:** `MR-T8-FB2-1.0.0`  
**Required Truth semantics:** `MR-TI-2-TFR1`  
**Database migration:** `0152_marketroute_forensic_build2_commercial_reality_producer.sql`  
**Prerequisite:** Forensic Build 1 / migration `0151` must already be deployed.

## 1. Purpose

Forensic Build 2 closes the largest wiring gap found in the Genesis T8 audit: the repository had CE-R2, CIE-R3 and R4 mathematics, and it had an R4 application worker, but there was no live production stage that actually created an R4 commercial decision from repaired Truth plus the persisted seller constraint set.

Build 2 establishes one explicit production lineage:

```text
Immutable seller context / seller constraints
                    +
Target-company MR-TI-2-TFR1 Truth snapshot
                    |
                    v
       TFR1 -> CE-R2 constraint adapter
                    |
                    v
       deterministic local constraint maths
                    |
                    v
       deterministic constraint propagation
                    |
                    v
       commercial coherence / stability
                    |
                    v
       CIE-R3 epistemic composition
                    |
                    v
       CIE-R4 commercial disposition
                    |
                    v
       immutable Build-2 lineage ledger
                    |
                    v
       authoritative R4 application
```

No legacy opportunity score, company-fit score, route score, contact score, `is_viable` flag, or AI numeric confidence is an input to the Build-2 producer.

## 2. Constitutional correction at the Truth -> CE-R2 boundary

Build 1 established that uncalibrated evidence strength is not a probability. Build 2 therefore removes the old CE-R2 primitive that assumed a probability with a meaningful 0.5 midpoint.

The live bridge now consumes separate Truth-owned channels:

- `supportStrength`
- `contradictionStrength`
- `evidenceSufficiency`
- `coverage`
- `contradictionSeverity`

Directional force is now:

```text
r = supportStrength - contradictionStrength
```

Evidence sufficiency and coverage affect represented knowledge, not the sign of the commercial premise:

```text
knowledge = evidenceSufficiency x coverage
```

This preserves the Build-1 invariant that weak positive evidence remains weak positive evidence rather than being transformed into negative commercial force.

## 3. AI relationship-strength isolation

The forensic audit found that the legacy Matrix-2 layer still contains AI-supplied numeric relationship strengths. Build 2 does **not** permit those numeric relationship effects to become R4 authority.

Entity Truth contributions now expose both:

- direct evidence contradiction channels; and
- relationship-derived contradiction channels for diagnostics.

The Build-2 producer consumes only the direct evidence channels. Relationship-derived numeric contradiction remains diagnostic/deferred until the canonical relationship architecture is rebuilt in Forensic Build 5.

This is deliberate: Build 2 would rather leave a relationship unresolved than smuggle an AI numeric judgement into deterministic authority.

## 4. Premise policy

Build 2 uses a deliberately conservative premise policy.

### Seller-owned facts

Two seller facts are canonical inputs because they originate from the persisted seller context itself:

- the seller has a persisted commercial offering;
- a commercial objective has been selected.

These are treated as `KNOWN` seller premises. The producer does **not** consume the seller-context AI `sourceConfidence` value as authority.

### External target facts

Target-company facts are sourced from `MR-TI-2-TFR1`. Because TFR1 is intentionally uncalibrated, represented external facts remain epistemically `UNCERTAIN`; they are not promoted to `KNOWN` merely because evidence exists.

The first mandatory target boundary premises are:

- `identity`
- `current_operation`

If either decision-critical claim is missing, the commercial reality fails closed to unresolved/research-required rather than treating absence as viability.

### Soft seller preferences

Industry and geography are currently mapped only as `LIMITING` preferences. A mismatch may create commercial pressure but cannot become a hard impossibility.

Basic deterministic geography aliases are normalised (for example UK / Great Britain / England -> United Kingdom; US / USA -> United States).

### Explicitly deferred constraints

Build 2 does not fabricate unresolved relationships for:

- company size;
- buyer roles;
- buyer pains;
- other seller constraints that require a structured target relationship adapter.

Their IDs are retained in `deferredSellerConstraintIds` for future relationship integration rather than silently assumed satisfied or failed.

## 5. No invented dependency graph

Build 2 calls deterministic CE-R2 propagation with an empty dependency graph.

That is intentional.

The canonical `depends_on`, `supplies`, `customer_of`, `part_of`, `uses_technology_from`, and related Genesis relationships are not yet the live commercial reasoning substrate. Inventing dependencies here would recreate the exact architectural dishonesty found in the audit.

Forensic Build 5 will wire canonical relationship identities into graph/dependency reasoning. Until then, Build 2 reasons only over direct premises it can actually establish.

## 6. Live R4 producer

New pure producer:

`lib/genesis-t8/cie/commercial-reality-producer.ts`

New production worker:

`lib/genesis-t8/cie/commercial-reality-worker.ts`

The worker:

1. claims opportunities lacking a Build-2 production;
2. loads the opportunity's scoped company record;
3. loads the immutable Genesis seller context;
4. resolves the target shared-intelligence company entity;
5. calculates a fresh TFR1 Truth snapshot using one reference time;
6. retrieves that exact snapshot;
7. runs the pure Build-2 producer;
8. atomically persists the full production lineage;
9. leaves R4 application to the existing authority-application stage.

There is no fallback to an old commercial decision if Truth or seller context cannot be resolved.

## 7. Scheduler authority order

The production scheduler is now ordered:

```text
Opportunity foundation materialisation
        -> Build-2 Commercial Reality production
        -> R4 decision application
        -> R6 contact authority
        -> R7 research counterfactual loop
```

Previously, the scheduler applied R4 rows without having a live stage that produced them.

## 8. Immutable production lineage

Migration `0152` creates:

`public.cie_r4_commercial_reality_productions`

Each production records:

- opportunity / organisation / campaign;
- scheduler run;
- producer version;
- 64-hex deterministic input fingerprint;
- seller-context fingerprint;
- seller-constraint fingerprint;
- target Truth entity;
- exact target Truth snapshot;
- Truth semantics version;
- reference time;
- commercial reality identity;
- propagation output;
- constraint contexts;
- CIE-R3 composition;
- R4 decision;
- deferred seller constraints.

The current `cie_r4_commercial_decisions` row is linked back to the immutable production through `production_id`.

## 9. SQL fail-closed gates

The Build-2 persistence RPC rejects a production unless all of the following hold:

- the scheduler lease is currently held;
- producer version is exactly `MR-T8-FB2-1.0.0`;
- Truth semantics are exactly `MR-TI-2-TFR1`;
- input, seller-context and constraint fingerprints have valid 64-hex form;
- propagation/composition/decision/context payload shapes are valid;
- the opportunity exists;
- seller context belongs to the same organisation/campaign and has the supplied fingerprint;
- the seller constraint set belongs to the same organisation/campaign and matches both fingerprints;
- the target Truth entity is an active company;
- that Truth company is provably the opportunity company through either the campaign knowledge link or exact canonical-domain identity;
- the Truth snapshot belongs to that entity;
- the snapshot carries TFR1 semantics;
- the snapshot was calculated at the exact production reference time;
- R3 remains `SHADOW` composition;
- R4 output is `AUTHORITATIVE`;
- opportunity/reality/target/state/disposition values match the decision payload;
- R4 cannot unlock engagement directly.

The migration also reloads the PostgREST schema after installing the new RPC contracts.

## 10. Old direct R4 persistence closed

Migration `0152` revokes service-role execution of the old:

`persist_cie_r4_commercial_decision(...)`

The TypeScript runtime no longer exports `persistCieR4CommercialDecision`.

The only Build-2 application persistence path writes the complete production trace through:

`persist_cie_r4_commercial_reality_production(...)`

This prevents an orphan R4 disposition from appearing without its Truth/seller/CE lineage.

## 11. Downstream provenance gate

Build 2 replaces the R4 application, R6 context/application and R7 research-context functions so they only consume R4 decisions carrying:

- producer version `MR-T8-FB2-1.0.0`;
- a non-null Build-2 `production_id`;
- Truth semantics `MR-TI-2-TFR1`.

This does **not** claim that R6's route/contact inputs are clean yet. It only prevents historical/orphan R4 records from entering those downstream stages.

## 12. What Build 2 proves

Build 2 now gives MarketRoute a live deterministic chain that can establish:

> Given this immutable seller context, this exact TFR1 target-company Truth snapshot, these explicitly represented premises, and these CE-R2/R3 rules, this R4 commercial disposition follows deterministically.

That is a proof of inference under declared premises.

It is **not** a claim that mathematics independently proves the outside-world premise. External premise quality remains the responsibility of evidence, Truth qualification, temporal validity and later canonical relationship reasoning.

## 13. Verification

Final local gates:

- **36/36** Build-2 static authority checks — PASS
- **20/20** repaired CE-R2 TFR1 adversarial invariants — PASS
- **13/13** Build-2 end-to-end adversarial cases — PASS
- **10/10** existing CIE-R3 adversarial composition cases — PASS
- **10/10** existing CIE-R4 adversarial authority cases — PASS
- isolated TypeScript compilation of the Build-2 pure kernel — PASS
- TypeScript syntax/transpile validation of the changed server modules — PASS

The end-to-end cases specifically prove that:

- weak positive evidence cannot become opposition;
- represented but uncalibrated target evidence does not become `KNOWN`;
- missing current-operation truth fails closed;
- stronger direct contradiction can eliminate a mandatory boundary;
- industry mismatch creates pressure but not hard elimination;
- geography aliases are deterministic;
- buyer-role relationships are deferred, not fabricated;
- seller source confidence cannot influence the output;
- fingerprints are deterministic;
- relationship-derived AI numeric contradiction cannot become Build-2 R4 authority;
- wrong Truth semantics are rejected;
- R4 cannot unlock engagement;
- commercial reality target identity is deterministic.

### Full application build note

This extracted project does not contain an installed dependency tree, so a literal full Next.js application build cannot be executed in this environment. The pure Build-2 TypeScript kernel compiles and the changed server modules pass TypeScript syntax/transpile validation. The user's normal dependency-installed/Vercel build remains the final whole-application compile gate.

### SQL execution note

No PostgreSQL/Supabase server is available inside this container, so migration `0152` has been structurally audited against the existing migration contracts but not executed against a live PostgreSQL parser here. Apply it before the Build-2 application code; Supabase is the final database compile gate.

## 14. Deployment order

1. Confirm Build 1 and migration `0151` are already deployed.
2. Apply `0152_marketroute_forensic_build2_commercial_reality_producer.sql`.
3. Deploy the Build-2 application code.
4. Confirm the scheduler begins creating rows in `cie_r4_commercial_reality_productions`.
5. Confirm new R4 current rows show `producer_version = 'MR-T8-FB2-1.0.0'` and `target_truth_semantics_version = 'MR-TI-2-TFR1'`.

Useful post-deploy checks:

```sql
select producer_version, target_truth_semantics_version, count(*)
from public.cie_r4_commercial_reality_productions
group by 1,2;

select disposition, producer_version, target_truth_semantics_version, count(*)
from public.cie_r4_commercial_decisions
where producer_version = 'MR-T8-FB2-1.0.0'
group by 1,2,3
order by 1;
```

## 15. Explicitly open — do not freeze yet

Build 2 intentionally does **not** close the remaining audit findings.

### Forensic Build 3 — state and invalidation architecture

Still open:

- the R4 foundation state regression that can demote downstream states on a later scheduler cycle;
- upstream Truth/seller changes must invalidate stale R4/R5/R6 authority through fingerprints;
- explicit legal state transitions and stale/current authority semantics.

### Forensic Build 4 — legacy route authority eradication

Still open:

- G4.7 weighted route maths;
- AI-supplied numeric route dimensions;
- legacy `commercial_routes.is_viable` feeding R5/R6 inputs.

### Forensic Build 5 — canonical relationship graph

Still open:

- actual `depends_on`, `supplies`, `customer_of`, `part_of`, etc. as the production reasoning substrate;
- multi-hop graph reachability / bottleneck / robustness;
- replacement of AI numeric relationship-strength effects with the new relationship constitution.

### Forensic Build 6 — contact Truth

Still open:

- R6's legacy binary `contact_evidence.verified=true` gates;
- identity, role, currentness, contradiction and channel qualification through Truth.

### Builds 7-8

Still open:

- authoritative read model / Founder Command Centre provenance;
- constitutional hardening, legacy quarantine and adversarial freeze certification.

## 16. Freeze status

**DO NOT FREEZE GENESIS T8 AFTER BUILD 2.**

Build 2 closes the missing live Commercial Reality producer and makes R4 provenance auditable. The state/invalidation defect and legacy route/contact authority remain live downstream and are the next forensic targets.

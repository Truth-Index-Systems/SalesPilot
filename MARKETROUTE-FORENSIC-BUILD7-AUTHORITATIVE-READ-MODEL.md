# MarketRoute Forensic Build 7 — Authoritative Read Model + Founder Command Centre

## Status

**BUILD COMPLETE — NOT A GENESIS T8 FREEZE**

Build 7 is a read/presentation-boundary release. It does not change the reasoning authority established by Forensic Builds 1–6. Its purpose is to make MarketRoute display those authorities faithfully and fail closed when the live lineage is stale, unresolved, expired, or mismatched with workflow state.

## Constitutional objective

Before Build 7, presentation code could still reconstruct apparent readiness from historical opportunity/contact views and raw authority rows. This created several risks:

- stale R4/R6 rows could be counted as current;
- `applied_at` could be mistaken for current readiness;
- old workflow `READY` or `APPROVED` could be displayed as if execution authority were still valid;
- company Truth could be read from pre-TFR1 snapshots;
- `represented_confidence` could be presented as confidence even though Build 1 redefined the live epistemic primitive as evidence sufficiency;
- an email or LinkedIn value could make route presentation look OPEN without proving the current R4 → R5 → R6 lineage;
- opportunity detail UI could hard-code route authority as OPEN even after authority invalidation.

Build 7 removes those presentation-authority leaks.

## New canonical read architecture

Migration `0157_marketroute_forensic_build7_authoritative_read_model.sql` creates three read-only views.

### 1. `cie_current_company_truth_read`

Exposes only the latest active company Truth snapshot with:

- `truth_semantics_version = MR-TI-2-TFR1`;
- Truth Index;
- coverage;
- **evidence sufficiency**;
- epistemic review state;
- probability calibration state;
- exact snapshot identity and calculation time.

Pre-repair Truth snapshots cannot become current founder-facing Truth through this view.

### 2. `cie_authoritative_opportunity_read`

This is now the canonical MarketRoute opportunity presentation model.

It derives current authority from exact lineage rather than workflow labels.

#### R4 is current only when

- the authority fingerprint is structurally valid;
- producer is `MR-T8-FB3-1.0.0`;
- an immutable Build-3 production exists;
- the exact target Truth semantics are `MR-TI-2-TFR1`;
- the referenced Truth snapshot actually resolves;
- the decision has been applied.

#### R5 is current only when

- authority status is `ACTIVE`;
- producer is `MR-T8-FB5-R5-1.0.0`;
- authority fingerprint is structurally valid;
- its parent R4 fingerprint equals current R4;
- the graph decision has been applied.

#### R6 is current only when

- authority status is `ACTIVE`;
- producer is `MR-T8-FB6-R6-1.0.0`;
- Contact Truth fingerprint is structurally valid;
- its R4 parent equals current R4;
- its R5 parent equals current R5;
- the binding has been applied;
- a named contact has not passed its Contact Truth revalidation boundary.

Organisational routes correctly require no named-person expiry timestamp.

### 3. `cie_authoritative_opportunity_detail_read`

Adds to the canonical opportunity lineage:

- company evidence;
- current Contact Truth evidence;
- workflow history;
- authority invalidation history.

It does not consult `opportunity_overview` or `opportunity_detail`.

## Canonical authority states

Build 7 exposes a single categorical read state:

- `AWAITING_COMMERCIAL_REALITY`
- `COMMERCIAL_AUTHORITY_STALE`
- `REJECTED`
- `TEMPORAL_HOLD`
- `RESEARCH_REQUIRED`
- `ROUTE_UNRESOLVED`
- `ROUTE_STALE`
- `CONTACT_UNRESOLVED`
- `CONTACT_STALE`
- `READY`

`READY` requires current R4 + current R5 + current R6.

A raw `opportunities.status = READY` is insufficient.

## Workflow and authority are deliberately separate

A founder workflow decision and current execution authority are different facts.

Examples:

- `APPROVED` + current R4/R5/R6: valid approval with current authority.
- `APPROVED` + stale R6: approval remains historical workflow truth, but execution authority is stale.
- `REJECTED` + mathematically READY authority: valid human rejection and **not** treated as an integrity error.
- `BUILDING` + fully current READY authority: detected as a workflow/authority mismatch, catching state regression.
- `ENGAGED` + later stale authority: not treated as a current workflow defect because engagement is historical execution state.

The Founder Command Centre now reports these mismatches explicitly.

## Legacy presentation authority removed

The canonical opportunity view emits historical numeric authority fields as `NULL`, including:

- opportunity score;
- company fit;
- operational fit;
- buying authority score;
- contactability score;
- route quality;
- route confidence;
- commercial value;
- evidence quality;
- urgency;
- legacy company confidence;
- historical primary-route scores.

It also does not expose old `buying_reason` / `operational_pain` text as current CIE authority.

This does not delete historical database records. It prevents them from reconstructing current readiness at the presentation boundary.

## Founder Command Centre changes

`lib/founder-dashboard/cie-command-centre.ts` now consumes:

- `cie_current_company_truth_read`;
- `cie_authoritative_opportunity_read`.

It no longer directly aggregates raw R4/R6 ledgers for readiness.

The dashboard now distinguishes:

- Truth Index;
- coverage;
- **evidence sufficiency**;
- probability calibration state;
- current R4 commercial realities;
- current R5/R6 reachability;
- route/contact stale counts;
- current READY authority;
- workflow/authority mismatches;
- latest authority invalidations;
- research pressure and queue telemetry.

The old founder-facing “Confidence” label for repaired Truth is removed.

## Opportunity UI changes

The opportunity repository no longer reads:

- `opportunity_overview`;
- `opportunity_detail`.

It reads the Build-7 canonical views directly.

The opportunity detail screen now exposes:

- workflow state separately from authority state;
- R4 producer + material authority fingerprint;
- R5 producer + graph authority fingerprint;
- R6 producer + Contact Truth fingerprint;
- exact authority Truth Index;
- evidence sufficiency;
- calibration state;
- named-contact revalidation time;
- latest invalidation reason;
- recent authority invalidation history.

Review controls and G5 execution controls are withheld when current authority is not `READY`.

Stored engagement content can remain visible for audit, but stale authority cannot be visually presented as current execution safety.

## Route presentation

`buildAccessRoute()` now requires the Build-7 read state:

- R5 must be current for a route to be OPEN;
- full execution readiness additionally requires current R6 + canonical `authority_ready`.

The UI can therefore represent:

> R5 route OPEN, R6 contact unresolved

without collapsing those two different authorities into one misleading green state.

## Historical validator reconciliation

The Build-5 static validator previously required the Build-5 repository overlay itself to contain the FB5 producer literal. Build 7 intentionally removes that repository overlay and moves the producer/version check into the canonical SQL read model.

The regression validator was updated to accept either the historical Build-5 overlay or the stronger Build-7 canonical successor. This is a test-contract evolution, not a weakening of the FB5 producer requirement.

## SQL safety

Build 7 creates views only.

It creates or replaces **no PostgreSQL function** and changes no `RETURNS TABLE` signature. Therefore the migration has no Build-3-style PostgreSQL `42P13` function-return-type hazard.

The migration is atomic:

`BEGIN → create read models → privilege hardening → PostgREST reload → COMMIT`

The standalone Supabase file is byte-for-byte identical to canonical migration 0157.

## Verification

### Build 7

- **41/41** static authority checks
- **11/11** SQL/signature safety checks
- **16/16** authoritative read-model adversarial tests
- **12/12** changed TypeScript/TSX modules transpile cleanly
- standalone SQL = canonical migration: **PASS**

### Regression

- Build 6 Contact Truth static: **22/22**
- Build 6 SQL signatures: **10/10**
- Build 6 Contact Truth adversarial: **15/15**
- current CIE-R6 static: **18/18**
- current CIE-R6 adversarial: **8/8**
- Build 5 canonical relationship graph static: **40/40**
- Build 5 SQL signatures: **11/11**
- Build 5 graph adversarial: **19/19**
- Build 3 lifecycle/static: **47/47**
- Build 3 lifecycle adversarial: **12/12**
- Build 2 authority/static: **36/36**
- repaired CE-R2 boundary: **20/20**
- Build 2 Commercial Reality adversarial: **13/13**
- CIE-R3 adversarial: **10/10**
- CIE-R4 adversarial: **10/10**
- Build 4 SQL signature gate: **11/11**

The old Build-4 static release validator is no longer a valid whole-project gate because Build 5 deliberately superseded R5 v2 with the canonical relationship-graph v3 and Build 7 deliberately supersedes the Build-4 repository overlay. Its SQL signature gate remains valid and green.

## Deployment order

1. Run `APPLY-IN-SUPABASE-FORENSIC-BUILD7.sql` / migration `0157`.
2. Deploy the Build-7 application source.
3. Allow PostgREST schema reload to complete.
4. Open Founder Command Centre and opportunity list/detail views.
5. Confirm current rows resolve from the new `cie_*_read` views.

No application reasoning migration is required after the views are installed.

## Deliberately deferred to Build 8

Build 7 makes presentation truthful. It does **not** claim final constitutional closure.

Build 8 remains responsible for adversarial hardening and freeze certification, including:

- production import/authority-lineage bans;
- required-boundary completeness attacks;
- AI numeric-jitter attacks;
- time-decay/invalidation attacks;
- stale queued-engagement attacks;
- canonical UI/source-of-truth enforcement;
- obsolete validator and freeze-document quarantine;
- end-to-end forensic traces from raw evidence to founder-facing state.

## Build-7 conclusion

After Build 7, MarketRoute no longer asks the UI to infer whether an opportunity is commercially ready.

It asks the authority system.

The founder-facing chain is now:

**TFR1 Truth → R4 Commercial Reality → R5 canonical relationship path → R6 Contact Truth → canonical read model → MarketRoute UI**

Workflow state remains visible, but it cannot impersonate current execution authority.

# MarketRoute Forensic Build 4 — Legacy Route Authority Eradication

## Status

Build complete. **Not frozen.**

Build 4 removes the historical G4.7 weighted route score and its `is_viable` / `is_primary` derivatives from live commercial authority. `commercial_routes` is now a candidate route-fact/evidence store. Persisted CIE-R5 is the sole route authority between current R4 commercial reality and R6 contact authority.

## Constitutional objective

Before Build 4 the live lineage was effectively:

`AI numeric route scores → G4 weighted route_quality → is_viable → CIE-R5 OPEN/BLOCKED → R6 → G5`

That violated the intended boundary because a legacy weighted equation still decided the Boolean consumed by T8.

After Build 4 the live lineage is:

`raw route facts + deterministically qualified evidence → CIE-R5 categorical route state → persisted R5 authority fingerprint → R6 contact binding → G5 execution gates`

No legacy route score participates in OPEN/BLOCKED, selection, queueing, autopilot approval or send-time execution.

## 1. Raw route contract

The contact research output no longer contains route-level numerical authority fields. The route contract removes:

- authority
- accessibility
- commercial relevance
- evidence quality
- resilience
- confidence
- difficulty as an authority input

The OpenAI prompt explicitly prohibits scoring, ranking, grading or viability classification of routes. AI proposes candidate facts and supporting evidence only.

The existing deterministic normaliser still validates official/company sources, company-domain email addresses and LinkedIn profile URLs before persistence.

## 2. Legacy G4 authority quarantined

The historical `save_route_intelligence(...)` weighted writer has service-role execution revoked.

The live owned writer no longer delegates to it. New rows are written with:

- `route_semantics_version = MR-T8-FB4-RAW`
- legacy numeric authority columns neutralised
- `is_primary = false`
- `is_viable = false`

Existing legacy rows are migrated to `MR-T8-FB4-MIGRATED-RAW`. Their old route authority values are copied into `legacy_authority_snapshot_json` before operational columns are neutralised, preserving forensic history without preserving causal power.

## 3. Evidence-qualified route state

A route may become `OPEN` only when its concrete execution value is supported by qualifying evidence.

The deterministic gate requires:

- Build-4 raw or migrated-raw semantics;
- a concrete supported channel type;
- a non-empty channel value;
- verified evidence;
- excerpt-matched evidence;
- a source URL;
- exact channel-value support appropriate to the channel.

Examples:

- email: exact address must appear in the evidence/source material;
- LinkedIn: exact normalised profile must match;
- switchboard: the phone digits must be present in evidence;
- introduction: the introduction value/person must be evidenced.

Unsupported candidate facts remain `UNRESOLVED`; they do not inherit a historical viability decision.

## 4. Persisted CIE-R5 authority

Build 4 creates `cie_r5_route_decisions` as the first-class route authority ledger.

Each decision records:

- parent R4 authority fingerprint;
- raw-route source fingerprint;
- material R5 authority fingerprint;
- selected route frontier;
- per-route categorical states;
- exact persisted channel strategy;
- graph assessment;
- ACTIVE / STALE lifecycle;
- producer version `MR-T8-FB4-R5-1.0.0`.

R5 authority invalidates when its R4 parent changes or its raw route/evidence source changes.

## 5. R6 is explicitly parented to R5

R6 now records `parent_r5_authority_fingerprint` as well as the R4 parent.

A contact binding is rejected unless its route belongs to the current R5 selected frontier. An R6 decision becomes stale when R4, R5, contact facts or contact evidence change.

Legacy active R6 decisions without an R5 parent are conservatively marked stale and revalidated.

## 6. G5 consumes, never recomputes, route authority

G5 Channel Strategy no longer runs CIE-R5 again against an older G5 snapshot. It loads the exact persisted R5 strategy and fingerprint.

The database completion RPC accepts only a channel strategy exactly equal to current persisted R5 authority, with:

- prompt `cie-r5-route-authority/v2`;
- model marker `CIE-R5-PERSISTED-AUTHORITY`;
- source fingerprint `cie-r5-authority:<current R5 fingerprint>`.

G5 commercial reasoning receives an R5-overlay context so its explanation refers to the same route that execution will later use. Historical G4 route score fields are overwritten with null in that context.

## 7. Execution is lineage-gated

The queue builder requires current matching R4 → R5 → R6 authority.

A selected or human-overridden route must:

- belong to the current R5 selected frontier;
- still evaluate `OPEN` under the evidence gate;
- be bound by current R6 authority;
- map to the expected execution channel;
- contain a concrete executable address/value.

Autopilot applies the same lineage checks.

The email send claim re-checks R5/R6 immediately before handing content to the sender. A stale queued item fails closed with `CIE_ROUTE_AUTHORITY_STALE_BEFORE_SEND` rather than executing old authority.

## 8. Read-model safety

Build 4 deliberately does **not** replace the historical `opportunity_overview` / `opportunity_detail` views. Those views are old and use `o.*`; replacing them now would create PostgreSQL view-column drift risk after years of added opportunity fields.

Instead Build 4 adds a narrow `cie_r5_route_authority_read` view and overlays it in the application repository.

Therefore:

- UI `OPEN` means an active persisted R5 route exists;
- contact email/LinkedIn fallbacks cannot impersonate route authority;
- route score badges are removed;
- old route-score scalar fields are nulled in the application read model.

The full historical view replacement remains intentionally deferred to Build 7.

## 9. Migration hardening

Migration `0154_marketroute_forensic_build4_legacy_route_authority_eradication.sql` is wrapped in one `BEGIN / COMMIT` transaction.

A dedicated SQL signature validator proves that every Build-4 `CREATE OR REPLACE FUNCTION` retains its prior return row contract. The only intentionally rebuilt RPC signature/body requiring replacement (`run_g5_autopilot_approval_owned(uuid)`) is explicitly dropped before creation.

This specifically guards against the PostgreSQL `42P13 cannot change return type of existing function` class encountered during Build 3.

## Verification

Build-4 gates:

- **42/42** static authority checks
- **11/11** SQL migration/signature checks
- **18/18** R5 adversarial route-authority tests
- **16/16** changed TypeScript/TSX modules syntax/transpile clean

Backward compatibility / underlying mathematics:

- **47/47** Build-3 static authority checks
- **12/12** Build-3 state/fingerprint adversarial tests
- **36/36** Build-2 static authority checks
- **20/20** CE-R2 repaired Truth-boundary tests
- **13/13** Build-2 Commercial Reality end-to-end tests
- **10/10** CIE-R3 adversarial tests
- **10/10** CIE-R4 adversarial tests
- **12/12** current CIE-R5 static checks
- **17/17** CIE-R6 static checks
- **8/8** CIE-R6 adversarial tests

No PostgreSQL server or full installed Next.js dependency tree is available in the audit container, so Supabase remains the final SQL execution gate and the deployment build remains the final whole-application compile gate.

## Deployment order

1. Run `APPLY-IN-SUPABASE-FORENSIC-BUILD4.sql` in Supabase.
2. Confirm the transaction succeeds.
3. Deploy the Build-4 application archive.
4. Allow the scheduler to revalidate historical R6 decisions against current R5 authority.

## Deliberately deferred

Build 4 does not claim to solve later forensic findings:

- **Build 5:** replace the current one-hop route graph with real canonical relationship graph reasoning (`depends_on`, `supplies`, `customer_of`, `part_of`, etc.).
- **Build 6:** replace legacy binary contact identity/role evidence qualification with full Truth-qualified contact claims and currentness.
- **Build 7:** replace historical opportunity read views with a complete authoritative R4/R5/R6 read model and rebuild Founder Command Centre metrics on it.
- **Build 8:** final constitutional hardening, dependency-lineage bans and adversarial production certification.

## Freeze status

**NO FREEZE.**

Build 4 removes the hidden G4 route authority from the live chain, but the real multi-hop commercial relationship graph is still the next architectural blocker.

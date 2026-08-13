# MarketRoute / Genesis T8 — Forensic Build 8
## Constitutional Hardening + Adversarial Certification

**Release:** MarketRoute Forensic Build 8  
**Certification manifest:** `MR-T8-FB8-CERT-1.0.0`  
**R4 boundary constitution:** `MR-T8-FB8-BOUNDARY-1.0.0`  
**Truth semantics:** `MR-TI-2-TFR1`  
**R4 producer:** `MR-T8-FB3-1.0.0`  
**R5 producer:** `MR-T8-FB5-R5-1.0.0`  
**R6 producer:** `MR-T8-FB6-R6-1.0.0`  
**Authoritative read model:** `cie-fb8-authoritative-read-model`  
**G5 categorical self-review:** `g5-self-review/v4-fb8-categorical-quality`  
**G5 diagnostic quality policy:** `g5-engagement-quality/fb8-categorical-v2`

Build 8 is the final engineering hardening build in the forensic remediation sequence. It does not add a new commercial-scoring model. Its purpose is to make the repaired architecture fail closed under missing boundaries, stale authority, lineage tampering, temporal races, legacy validator drift and AI numeric jitter.

It is **not** the final production freeze declaration. After deployment, a separate no-code forensic freeze certification should trace real persisted opportunities through Supabase/Vercel.

---

## 1. Constitutional authority chain after Build 8

The live decision chain is now:

```text
Evidence
  ↓
MR-TI-2-TFR1 Truth
  ↓
R4 mandatory-boundary constitution
  ↓
CE-R2 deterministic commercial reality
  ↓
R4 material authority fingerprint
  ↓
R5 evidence-qualified canonical relationship path
  ↓
R5 authority fingerprint
  ↓
R6 Contact Truth + contact/path binding
  ↓
R6 authority fingerprint / revalidation boundary
  ↓
G5 categorical communication-quality review
  ↓
Human/autopilot approval
  ↓
Queue / send-time constitutional revalidation
  ↓
Authoritative read model / Founder Command Centre
```

No legacy weighted opportunity/route/contact score is allowed to reconstruct this chain.

---

## 2. Required-boundary completeness

The original forensic audit identified an open-world defect: R4 could fail closed for constraints it had received while still treating an omitted boundary question as if no boundary existed.

Build 8 introduces a versioned mandatory boundary constitution for the current R4 reality class:

`SELLER_TO_TARGET_COMMERCIAL_ENGAGEMENT`

The five mandatory questions are:

1. `seller.has_persisted_commercial_offering`
2. `seller.selected_commercial_objective`
3. `target.identity`
4. `target.canonical_domain`
5. `target.current_operation`

These are deliberately the mandatory prerequisites for **commercial engagement admissibility**, not a claim that delivery/procurement/legal/technical feasibility has been globally proven. Seller-specific targeting constraints continue to enter CE-R2 through the persisted seller constraint set; route/contact executability is separately proven by R5/R6.

The constitution records:

- required boundary keys;
- represented boundary keys;
- unresolved boundary keys;
- missing mandatory boundary keys;
- constitution version and reality class;
- downstream R5/R6 requirements.

A `COMMERCIAL_CANDIDATE` cannot be persisted unless all five mandatory questions are represented and none are unresolved/missing.

`RESEARCH_REQUIRED` remains a legitimate current epistemic state when a mandatory question is unresolved. Missing knowledge therefore becomes research debt, not false rejection and not false viability.

The TypeScript producer and PostgreSQL persistence RPC both enforce the constitution independently.

---

## 3. Exact temporal authority — no worker race

Before Build 8, an R6 Contact Truth record could pass its precise `next_revalidation_at` timestamp while queue/autopilot/send logic still saw `authority_status='ACTIVE'` until an invalidation worker ran.

Build 8 removes that race by creating three scalar constitutional predicates:

- `cie_r4_authority_current(uuid)`
- `cie_r5_authority_current(uuid)`
- `cie_r6_authority_current(uuid)`

These predicates validate lineage and temporal currentness **at the instant of the operation**.

They are used by:

- R5 persistence;
- R6 persistence/application;
- R7 research context;
- G5 self-review/quality completion;
- human approval;
- autopilot approval;
- queue creation;
- email send-time claiming;
- Build-8 authoritative read views.

An invalidation worker is now useful for state cleanup/observability but is no longer required for safety.

---

## 4. Lineage tamper resistance

Build 8 keeps the Build-3 distinction between exact input lineage and material authority lineage, then hardens every parent relationship.

R5 must point to the current exact R4 material fingerprint.

R6 must point to both:

- current R4 authority fingerprint;
- current R5 authority fingerprint.

The canonical read model independently rechecks those links.

Any parent fingerprint mismatch fails closed.

The R4 boundary constitution and completeness state are included in both the exact production trace and material R4 authority fingerprint, so changing the constitutional premise cannot silently preserve old authority.

---

## 5. AI numeric jitter removed from G5 workflow authority

The second Build-8 attack found a remaining non-R4/R5/R6 authority cliff in G5 self-review.

Historically, the AI emitted 0–100 fields and MarketRoute converted values such as 89/90 into PASS/REWRITE/BLOCK through hard thresholds. Although these scores did not alter Truth, they could alter workflow progression.

Build 8 replaces that with:

### AI responsibility
The model returns a **categorical semantic finding**:

- `PASS`
- `REWRITE`
- `BLOCK`

plus explicit:

- unsupported claims;
- blocked reasons;
- criticism;
- rewrite instructions;
- diagnostic numeric scores.

### Deterministic MarketRoute responsibility
MarketRoute enforces:

- `PASS` is impossible with any unsupported claim;
- `PASS` is impossible with any blocked reason;
- the rewrite limit is deterministic;
- R4/R5/R6 must all be current;
- only prompt version `g5-self-review/v4-fb8-categorical-quality` is executable;
- only quality policy `g5-engagement-quality/fb8-categorical-v2` is executable.

The remaining 0–100 quality dimensions and `engagementConfidence` are **diagnostic telemetry only**. They are range-validated and may be displayed for explanation, but no numeric threshold can approve, queue or send outreach.

Adversarial tests explicitly prove that a categorical PASS with numeric telemetry `0` has the same workflow outcome as a categorical PASS with telemetry `100`.

---

## 6. Pre-Build-8 G5 authority reconciliation

Stored engagements created under the old numeric-threshold review policy are not grandfathered into execution authority.

For unsent old-policy engagements, migration 0158:

1. records a forensic execution hold explaining the Build-8 revalidation;
2. removes the unsent queue row so the unique `strategy_id` queue constraint cannot deadlock later re-queueing;
3. returns eligible strategies to `SELF_REVIEW`;
4. clears old self-review and engagement-quality authority fields;
5. clears previous autopilot approval metadata;
6. requires fresh categorical v4 self-review and v2 quality diagnostics before approval/queueing.

Already-sent historical executions are not rewritten or pretended to be unsent.

---

## 7. Legacy and validator quarantine

Build 8 adds:

`lib/genesis-t8/constitutional-authority-manifest.ts`

This pins the current production authority versions and declares quarantined import fragments.

Active R4/R5/R6 authority modules are statically and transitively checked so they cannot import historical decision systems such as:

- old Truth equation/read model;
- legacy fit scoring;
- legacy commercial reasoning authority;
- legacy seller projection authority.

The current authority modules are also checked for direct reads of legacy authority fields including:

- `opportunity_score`
- `company_fit`
- `operational_fit`
- `route_quality`
- `route_confidence`
- `is_viable`
- `overall_confidence`
- `engagement_confidence`
- `email_status`

Historical scripts remain in the repository for archaeology, but the new validator registry explicitly identifies which validators are acceptable forensic certification evidence and which are quarantined because they target deleted/superseded architecture.

---

## 8. Build-time constitutional gate

`package.json` now provides:

- `forensic:build8-static-check`
- `forensic:build8-sql-signature-check`
- `forensic:build8-runtime-check`
- `forensic:build8-authority-contract-check`
- `forensic:build8-g5-quality-check`
- `forensic:build8-check`
- `forensic:certification-check`

The normal `prebuild` gate runs the Build-8 static and SQL-signature audits before the application build.

The complete certification command also re-runs the forensic regression layers and CIE-R3/R4/R6 adversarial kernels.

---

## 9. Founder-facing provenance

The opportunity detail now exposes the boundary constitution rather than hiding it behind a green status.

Founder-visible authority lineage includes:

- R4 boundary constitution version;
- COMPLETE / RESEARCH REQUIRED / INCOMPLETE state;
- unresolved mandatory questions;
- missing mandatory questions;
- R4 revalidation deadline;
- R4 material fingerprint;
- R5 graph authority/fingerprint;
- R6 Contact Truth fingerprint/revalidation;
- exact TFR1 Truth snapshot provenance.

The Build-8 canonical read model uses the same PostgreSQL currentness predicates as execution. Presentation and execution therefore share one definition of current authority.

---

## 10. PostgreSQL migration safety

Migration:

`0158_marketroute_forensic_build8_constitutional_hardening.sql`

Standalone Supabase copy:

`APPLY-IN-SUPABASE-FORENSIC-BUILD8.sql`

Properties:

- wrapped in `BEGIN ... COMMIT`;
- standalone SQL is byte-identical to canonical migration;
- new columns use rerun-safe `ADD COLUMN IF NOT EXISTS`;
- all replaced pre-existing RPC parameter and return signatures are unchanged;
- no `RETURNS TABLE` row signature is changed;
- no colliding plain `CREATE FUNCTION` declarations;
- authoritative views are dropped in dependency order and recreated;
- PostgREST schema reload included;
- currentness helpers are scalar booleans and executable only by `service_role`.

This specifically guards against the PostgreSQL `42P13` class encountered during Build 3.

---

## 11. Adversarial certification results

### Build 8

- **76/76** constitutional/static authority checks
- **11/11** PostgreSQL/signature safety checks
- **12/12** R4 boundary/producer adversarial tests
- **12/12** authority-lineage/temporal adversarial tests
- **9/9** categorical G5 communication-quality adversarial tests
- **14/14** changed Build-8 TS/TSX modules syntax/transpile cleanly

### Forensic regression

- **11/11** Build-1 Truth Foundation
- **20/20** repaired CE-R2 Truth-boundary mathematics
- **13/13** Build-2 Commercial Reality
- **12/12** Build-3 state/invalidation
- **19/19** Build-5 canonical relationship graph
- **15/15** Build-6 Contact Truth
- **16/16** Build-7 authoritative read model

### CIE kernel regression

- **10/10** CIE-R3
- **10/10** CIE-R4
- **8/8** CIE-R6

No currently known authority bypass was found by the Build-8 audit after these repairs.

---

## 12. Explicit non-claims

Build 8 does **not** claim:

- calibrated real-world probability where no empirical calibration exists;
- that every possible legal/procurement/technical delivery constraint is known merely because an engagement candidate exists;
- that AI proves real-world premises;
- that a commercial candidate guarantees purchase;
- that a relationship exists without evidence-qualified provenance;
- that a previously sent message can be retroactively brought under a new constitution.

Genesis proves deterministic consequences of the premises it has qualified and represented. Evidence and semantic interpretation remain responsible for premise establishment.

---

## 13. Deployment order

1. Run `0158_marketroute_forensic_build8_constitutional_hardening.sql` in Supabase.
2. Deploy the Build-8 application source.
3. Allow R4/R5/R6 and G5 revalidation to re-establish current authority under the Build-8 constitution.
4. Inspect Founder Command Centre mismatches/stale counts.
5. Perform the separate **no-code forensic freeze certification** against real persisted production/dev data.

Do not mark Genesis T8 frozen solely because Build 8 compiles. The freeze should be issued only after the post-deploy lineage audit confirms that the real environment behaves like the certified source.

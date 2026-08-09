# MR-TI-2 Build 8.3 — Legacy Eradication Pass

## Purpose

Build 8.3 removes MR-TI-1/TI-1 semantics from every production-reachable Genesis G8 reasoning path. Historical TI-1 rows and migrations are retained for audit only; they are no longer permitted to calculate, rank, refresh, review, budget, hydrate, or present current intelligence.

## Production invariants

1. MR-TI-2 claim contracts are the sole live claim-contract source.
2. Active TypeScript cannot import the TI-1 calculator, TI-1 read model, TI-1 contract module, or legacy repair AI.
3. Missingness, blocking, repair priority, and review are driven by MR-TI-2 impact/review semantics rather than legacy criticality.
4. Active retrieval, founder metrics, capacity truth-gain, refresh scheduling, and review lineage read `genesis_g8_truth_v2_snapshots` only.
5. `critical_claim_ceiling` cannot participate in an active read/ranking path.
6. Old `criticality` values exist only as compatibility labels where legacy physical database columns still require them. They do not drive reasoning.
7. TI-1 snapshot history remains readable but becomes write-isolated.

## TypeScript removals

Removed compile-visible legacy modules:

- `lib/genesis-g8/truth/`
- `lib/genesis-g8/read-model.ts`
- `lib/genesis-g8/contracts.ts`
- `lib/genesis-g8/discovery-repair-openai.ts`

Introduced neutral shared primitives:

- `lib/genesis-g8/entity-types.ts`
- `lib/genesis-g8/evidence-types.ts`

The G8 public index no longer exports TI-1 modules.

## V2 contract authority

Entity creation, discovery acquisition, autonomous expansion, and persistence claim creation now use `getMrTi2ClaimContract()`.

Existing `genesis_g8_intelligence_claims.criticality` is retained only because it is part of the historical physical schema. At the persistence boundary only:

- `FOUNDATIONAL -> CRITICAL`
- `COMMERCIAL -> REQUIRED`
- `SUPPORTING -> SUPPORTING`
- `OPTIONAL -> OPTIONAL`

No production decision reads those compatibility values.

## SQL migration 0132

`0132_genesis_g82_mrti2_build8_3_legacy_eradication.sql` rewrites the production SQL boundary.

### Company retrieval projection

- latest Truth source -> `genesis_g8_truth_v2_snapshots`
- identity confidence -> V2 diagnostics contributions
- contact/route truth -> V2 snapshots
- legacy physical `critical_claim_ceiling` projection column is written as `0` only for schema compatibility
- old TI-1 snapshot trigger removed
- new V2 snapshot trigger installed
- search RPC no longer returns a critical ceiling

### Background refresh

- reads V2 claim profiles and V2 snapshots
- returns `impact_class`
- prioritises by MR-TI-2 claim weight, impact class, freshness, demand, and V2 Truth
- `p_impact_class` replaces the live `p_criticality` API contract

### Repair claiming

- joins `genesis_g8_truth_v2_claim_profiles`
- returns `impact_class`
- priorities are based on V2 impact class + claim weight
- queue `criticality` is no longer part of ordering

### Capacity budgeting

Daily Truth gain now derives only from MR-TI-2 snapshots.

### Founder command centre

All current Truth, confidence, coverage, review-required, industry health and attention calculations now originate from V2 snapshots.

### Founder review lineage

Human review receipts gain `truth_v2_snapshot_id`. New founder resolutions bind to the latest V2 snapshot and leave the old TI-1 snapshot FK null.

### TI-1 hard isolation

The migration drops:

- `insert_genesis_g8_truth_snapshot(...)`
- `record_genesis_g8_human_review(...)`
- `genesis_g8_result_claim_confidence(...)`

It also revokes INSERT/UPDATE/DELETE on `genesis_g8_truth_snapshots` from `service_role` while retaining SELECT for historical audit.

## Validation

Dedicated Build 8.3 legacy-eradication validator checks 36 production invariants, including absence of TI-1 source modules, absence of TI-1 snapshot/ceiling references from active TypeScript, V2 SQL routing, and confinement of criticality compatibility mappings.

Preserved deterministic mathematical suites remain unchanged and green:

- Build 3 evidence maths: 16 invariants
- Build 4 Matrix 1 / claim probability: 26 invariants
- Build 5 Matrix 2: 15 invariants
- Build 6 entity aggregation: 26 invariants
- Build 8.2 cold-start: 16 checks
- Build 8.2.1 ambiguity hotfix: 8 checks

## Deployment requirement

Vercel does not apply Supabase migrations. After the ZIP compiles/deploys, apply **migration 0132 in full** to Supabase before judging production behaviour.

Build 8.3 is additive/destructive only at the function/permission layer: historical TI-1 tables and rows are not deleted or rewritten.

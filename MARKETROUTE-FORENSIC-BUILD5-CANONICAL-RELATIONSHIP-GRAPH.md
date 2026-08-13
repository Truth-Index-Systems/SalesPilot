# MarketRoute / Genesis T8 — Forensic Build 5
## Canonical Relationship Graph Integration

**Build:** Forensic Build 5  
**Migration:** `0155_marketroute_forensic_build5_canonical_relationship_graph.sql`  
**R5 producer:** `MR-T8-FB5-R5-1.0.0`  
**R5 strategy contract:** `cie-r5-route-authority/v3`  
**Graph calculus build:** `CE2-R7-FB5`  
**Status:** Engineering build complete; not a Genesis T8 freeze.

---

## 1. Purpose

Forensic Build 5 closes the representation-to-reasoning gap identified in the initial audit.

Before this build, Genesis T8 contained a strong canonical relationship catalogue and a commercial graph calculus, but live R5 route authority mostly reduced routes to synthetic one-hop seller/objective edges. The graph therefore could not express the commercial structure it claimed to reason over.

Build 5 makes canonical relationships a live R5 reasoning substrate.

The production authority chain is now:

```text
Evidence-qualified raw route facts
        +
Evidence-qualified canonical relationship assertions
        +
Current R4 Commercial Reality authority
        ↓
Canonical directed commercial graph
        ↓
Reachability / path enumeration / Pareto / graph robustness
        ↓
Persisted R5 relationship-path authority
        ↓
R6 contact binding
        ↓
G5 engagement execution
```

The build does **not** manufacture relationships to make a graph complete. If a structural relationship is not evidenced, it remains unresolved and the corresponding route cannot become OPEN merely because its channel value exists.

---

## 2. Constitutional boundary

Build 5 preserves the forensic rule established in Builds 1–4:

> AI may propose semantic relationships and supporting evidence. It does not assign mathematical relationship authority.

AI relationship output therefore contains:

- canonical relation type;
- source entity;
- target entity;
- rationale;
- evidence.

It does **not** contain authoritative:

- strength;
- confidence;
- score;
- weight;
- rank.

The database persistence layer also rejects those top-level numeric authority fields.

A relationship enters the live graph only after deterministic canonicalisation, source/evidence checks, direction validation and persistence as an active canonical assertion.

---

## 3. Canonical relationship ontology

The pre-existing Genesis T8 catalogue remains authoritative for business relationships, including:

- `depends_on`
- `contradicts`
- `equivalent_to`
- `part_of`
- `parent_of`
- `subsidiary_of`
- `partners_with`
- `supplies`
- `customer_of`
- `uses_technology_from`
- `supersedes`

Build 5 adds execution-structure relationships required to connect commercial reality to a usable route:

- `employs`
- `has_access_point`
- `reachable_via`
- `introduced_by`

Each relationship is resolved through the canonical catalogue to an edge class and direction. Live R5 graph edges are rejected if they do not carry valid canonical ontology metadata.

Directed relationships are never reversed to make a route work. Undirected relationships may be traversed in either direction while retaining one canonical assertion.

---

## 4. Real multi-hop route topology

Build 5 replaces the old one-hop abstraction with explicit path topology.

### Generic organisational access

```text
Target Company
   └─ has_access_point → General / Public Access Point
                              └─ reachable_via → Engagement Objective
```

### Named person

```text
Target Company
   └─ employs → Named Person
                    └─ reachable_via → Engagement Objective
```

A named person's email alone proves the reachable channel. It does not prove employment. R5 therefore requires separate structural person/role evidence before the route becomes OPEN.

### Department / organisational unit

```text
Target Company
   └─ parent_of → Organisational Unit
                       └─ reachable_via → Engagement Objective
```

The structural edge may be supplied by qualified route evidence or by a persisted canonical relationship assertion.

### Introduction path

```text
Target Company
   └─ partners_with / introduced_by / qualified relation → External Organisation or Introducer
                                                               └─ reachable_via → Engagement Objective
```

The graph does not infer an introduction from the existence of a partner. The route still requires an evidenced introduction/referral execution path.

---

## 5. Relationship persistence is separate from route persistence

Build 5 introduces:

`genesis_t8_canonical_relationship_assertions`

This is intentionally separate from `commercial_routes`.

A canonical relationship assertion represents a proposition such as:

```text
Target Company PARTNERS_WITH Organisation X
```

A route represents an executable access candidate.

Those concepts no longer share one overloaded row.

Canonical relationship assertions persist:

- organisation / campaign / company / session scope;
- canonical relation type;
- canonical edge class;
- canonical direction;
- source and target node identities;
- entity kinds;
- labels/domains;
- evidence;
- rationale;
- source semantics/fingerprint;
- ACTIVE/STALE lifecycle.

External organisation identities require a canonical domain.

---

## 6. Evidence qualification

Relationship proposals are accepted only when qualifying relationship evidence survives deterministic normalisation.

Key rules include:

- relationship evidence must use `RELATIONSHIP` evidence type;
- the relationship must involve the target company;
- external organisations require canonical domains;
- evidence sources must be allowed for the relevant target/external organisation scope;
- evidence must be verified;
- the excerpt must actually identify both relationship endpoints;
- self-relations are rejected;
- unknown relationship types are rejected;
- literal relationship direction is preserved.

No numeric relationship score is used to decide whether the relationship is true enough to enter R5 authority.

---

## 7. R5 is now graph authority

`lib/genesis-t8/cie/route-authority.ts` is now Build-5 R5 (`3.0.0`).

R5 constructs a canonical graph whose fixed boundary nodes are:

```text
cie:target-company
cie:engagement-objective
```

Intermediate nodes represent people, organisational units, access points, introducers and persisted business entities.

Every live route path contains at least:

1. a qualified structural/business edge from the target company into the route endpoint; and
2. a `reachable_via` execution edge from that endpoint to the engagement objective.

R5 evaluates the graph with the existing CE2 graph calculus and records selected path provenance rather than merely selected route IDs.

Persisted path provenance includes:

- node sequence;
- edge IDs;
- source relationship assertion IDs where applicable;
- canonical relation type;
- edge class;
- direction;
- OPEN/UNRESOLVED state;
- selected route identity.

The selected route must still satisfy Build 4's raw channel-evidence rule. A graph relation cannot turn an unsupported email/LinkedIn/phone/introduction value into an OPEN route.

---

## 8. Graph robustness now measures structural dependence

Because routes now contain real intermediate nodes, graph robustness becomes commercially meaningful.

Example:

```text
Target → Person A → email route
Target → Person A → LinkedIn route
```

These are two channels but one structural dependency: Person A. The vertex-disjoint robustness is therefore one.

By contrast:

```text
Target → Person A → email
Target → Public Access Point → switchboard
Target → Person B → LinkedIn
```

contains genuinely independent access points and can increase vertex-disjoint route robustness.

This is the first production version where CE2 path redundancy and bottleneck reasoning can distinguish channel multiplicity from relationship-path independence.

---

## 9. R5 authority persistence

Build 5 adds a new persistence RPC:

`persist_cie_r5_relationship_graph_decision(...)`

The previous Build-4 R5 writer remains as historical database archaeology but its service-role execution authority is revoked.

The Build-5 R5 ledger now persists:

- R4 parent authority fingerprint;
- exact R5 source fingerprint;
- material R5 authority fingerprint;
- selected route IDs;
- route states;
- relationship states;
- full path provenance;
- graph assessment;
- deterministic strategy;
- producer/version semantics.

A selected route is rejected by the database unless its persisted provenance proves an OPEN canonical path with at least two edges.

If a provenance edge references a persisted canonical relationship assertion, that assertion must still be ACTIVE, OPEN and in the correct company/campaign scope.

---

## 10. Authority lineage and invalidation

Build 5 advances the R5 lineage contracts:

- R5 source fingerprint: `MR-T8-FB5-R5-SOURCE-1.0.0`
- R5 material authority fingerprint: `MR-T8-FB5-R5-AUTHORITY-1.0.0`
- R6 source fingerprint: `MR-T8-FB5-R6-SOURCE-1.0.0`

The R5 source fingerprint includes both:

- raw route/evidence state; and
- canonical relationship assertions.

The material R5 authority fingerprint includes the selected path topology and canonical relation provenance.

R5/R6 are invalidated and fail closed when their authority source becomes stale. Existing active Build-4 R5/R6 decisions are marked for revalidation because their one-hop authority semantics are not equivalent to the Build-5 graph semantics.

---

## 11. R6 and engagement integration

R6 still performs categorical route/contact binding, but its parent R5 authority must now be the active Build-5 graph decision.

G5 engagement no longer recomputes route authority. It consumes the persisted R5 v3 strategy and selected relationship path.

Queue, autopilot and execution checks continue to require current R4 → R5 → R6 lineage.

This preserves Build 4's fail-closed guarantee: a stale relationship path cannot remain executable simply because an outreach message was already generated or queued.

---

## 12. Read model

The existing broad historical opportunity view is deliberately not replaced in Build 5.

Build 5 continues the narrow authoritative R5 read-model overlay introduced in Build 4 and advances it to Build-5/v3 semantics.

A complete consolidated authoritative read-model replacement remains Build 7, where historical UI inference will be removed systematically rather than by mutating an old wide view in place.

---

## 13. PostgreSQL migration safety

Migration `0155` is atomic:

```text
BEGIN
  → relationship schema/functions
  → R5 graph authority persistence
  → R5/R6 invalidation lineage
  → downstream authority contract updates
  → PostgREST reload
COMMIT
```

Following the Build-3 PostgreSQL `42P13` issue, Build 5 has a dedicated RPC signature validator.

The R6 context RPC retains exactly the same PostgreSQL OUT/return row signature while adding richer information inside its JSON payload. No incompatible `CREATE OR REPLACE` row-type mutation is attempted.

The function that is intentionally rebuilt with a changed contract is explicitly dropped before recreation.

The standalone SQL file is byte-identical to canonical migration `0155`.

---

## 14. Adversarial invariants proven

Build-5 tests specifically prove:

1. a generic access route is a canonical two-hop path;
2. every live path edge carries canonical ontology metadata;
3. named-person routes fail without employment structure evidence;
4. named-person routes open with person/role + channel evidence;
5. department routes fail without structural-unit evidence;
6. department routes use `parent_of → reachable_via`;
7. a persisted `parent_of` assertion can supply structural evidence;
8. a rich partnership assertion can supply an introduction structure;
9. undirected partnerships are traversable from either stored orientation;
10. directed `supplies` relationships are never silently reversed;
11. unknown relation types are rejected;
12. legacy `isViable=true` cannot open an unsupported channel;
13. legacy `isViable=false` cannot block an otherwise qualified path;
14. injected numeric relationship strength/confidence/weight cannot alter R5 authority;
15. multiple channels through the same person remain one structural dependency;
16. distinct access points create genuinely redundant graph paths;
17. R5 v3 is the authoritative persisted engagement contract;
18. selected path provenance is OPEN and multi-hop;
19. absence of a qualified path fails closed.

---

## 15. Verification results

### Build 5

- **40/40** Build-5 static authority checks — PASS
- **11/11** PostgreSQL/RPC signature checks — PASS
- **19/19** Build-5 graph adversarial tests — PASS
- **13/13** changed application module TypeScript transpile checks — PASS
- strict isolated Build-5 graph/R5 TypeScript compilation — PASS
- standalone SQL equals canonical `0155` — PASS

### Regression

- **36/36** Build-2 static authority checks — PASS
- **20/20** repaired CE-R2 Truth-boundary tests — PASS
- **13/13** Build-2 Commercial Reality tests — PASS
- **47/47** Build-3 static authority checks — PASS
- **12/12** Build-3 state/fingerprint tests — PASS
- **10/10** CIE-R3 adversarial composition tests — PASS
- **10/10** CIE-R4 adversarial authority tests — PASS
- **14/14** current CIE-R5 static checks — PASS
- **17/17** current CIE-R6 static checks — PASS
- **8/8** current CIE-R6 adversarial tests — PASS

The recursive historical npm validation chain attempts to load React/Node type packages that are absent from the stripped audit workspace. Those kernels were therefore compiled independently with empty implicit type roots; their source-level tests pass as listed above. The user's normal project/deployment environment remains the final full Next.js compilation gate.

---

## 16. Deployment order

1. Run `APPLY-IN-SUPABASE-FORENSIC-BUILD5.sql` / migration `0155` in Supabase.
2. Confirm the migration commits successfully.
3. Deploy the Build-5 application ZIP.
4. Allow the scheduler to revalidate Build-4 R5/R6 authority under Build-5 graph semantics.
5. Inspect logs for new R5 relationship-path production and any deliberately unresolved structural relationships.

Do not deploy application code before the migration because Build 5 calls new relationship/R5 RPC contracts.

---

## 17. What Build 5 deliberately does not claim

Build 5 does **not** claim that every relationship in the entire Genesis 9D knowledge graph is now automatically available to every product subsystem.

It establishes the live production substrate needed for R5:

- evidence-qualified canonical relationship assertions;
- deterministic structural execution relations;
- canonical graph composition;
- multi-hop R5 route authority;
- persisted path provenance;
- R6/G5 consumption of that authority.

Broader relationship acquisition can now expand into this substrate without changing the authority model.

Build 5 also does **not** complete contact epistemics. R6 still consumes the existing contact evidence qualification boundary, including legacy binary verification concepts. That is intentionally the target of Forensic Build 6.

---

## 18. Remaining Build-6 target

**Forensic Build 6 — Contact Truth & Route Authority** should replace legacy binary contact qualification with explicit Truth-qualified claims for:

- person identity;
- current employer / organisational membership;
- current role;
- role recency;
- channel ownership;
- channel currentness;
- contradiction;
- source independence;
- temporal uncertainty.

Once Build 6 is complete, the structural edges introduced here (`employs`, organisational membership/access, contact-channel route) can be driven by the same repaired epistemic principles as company Truth rather than by historical `verified=true` evidence rows.

---

## 19. Build 5 conclusion

Before Build 5, Genesis had a relationship ontology and graph mathematics, but live route authority did not truly traverse that ontology.

After Build 5, R5 is an evidence-qualified relationship-path authority system:

```text
Commercial Reality
      ↓
Canonical relationships
      ↓
Explicit graph topology
      ↓
Reachability + robustness
      ↓
Persisted path provenance
      ↓
Categorical route authority
```

The mathematics now reasons over represented commercial relationships instead of synthetic one-hop placeholders.

**Build 5 is complete. Genesis T8 remains intentionally unfrozen pending Builds 6–8 and the final forensic certification audit.**

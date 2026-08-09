# Genesis T8 — CE Release 1 / Build 2
## Commercial Token Theory v1.0

Build 2 defines the atomic knowledge representation that Build 3 will place into the 9D Commercial Graph. It does not change the active MarketRoute pipeline, database schema, AI research prompts, or TI-2.1.8 mathematics.

## Core definition

A **Commercial Token** is one atomic, canonical, evidence-addressable assertion about one subject entity at an optional time interval.

Examples:

- `company:A | operations.has_warehouse | true`
- `company:A | technology.erp | SAP_S4HANA`
- `company:A | finance.revenue_gbp | 250000000`
- `company:A | strategy.expansion_event | distribution_centre`

A token is not a paragraph, summary, recommendation, score, relationship bundle, or AI opinion.

## Token / evidence / truth boundary

AI may discover and canonicalise a candidate assertion. It must reference evidence. AI cannot assign truth probability, confidence, coverage, or commercial fit.

The existing frozen TI-2.1.8 engine remains the sole owner of evidence mathematics and truth qualification. A token may carry TI output only after TI qualification.

Evidence is not the token. Evidence supports or contradicts a token. Token identity therefore excludes evidence IDs and TI scores.

## Token / relationship boundary

A token represents an atomic proposition. A relationship connects two tokens and is a first-class graph object with its own provenance.

Do not encode `warehouse -> supports -> inventory` as a token value. Persist `warehouse` and `inventory` as tokens and represent `supports` as an edge between them.

The finite relationship vocabulary and the 9-dimensional graph semantics are deliberately deferred to Build 3.

## Identity

Token semantic identity is determined from:

1. subject entity;
2. canonical predicate;
3. canonical value;
4. optional validity interval.

Identity explicitly excludes:

- evidence IDs;
- truth score;
- confidence;
- coverage;
- lifecycle state;
- graph-dimensional position;
- downstream commercial reasoning.

Those properties may evolve without changing which proposition the token represents.

## Lifecycle

The legal lifecycle is:

`DISCOVERED -> CANONICALISED -> HARD_VALIDATED -> TRUTH_QUALIFIED -> ACTIVE -> SUPERSEDED -> RETIRED`

Retirement is allowed from pre-active stages when a candidate is invalid or intentionally abandoned. Active knowledge is superseded rather than overwritten so provenance and history remain intact.

## Mutability

Build 2 defines intrinsic mutability, not refresh cadence:

- `IMMUTABLE`
- `VERY_STABLE`
- `STABLE`
- `DYNAMIC`
- `HIGHLY_DYNAMIC`
- `EVENT_BOUND`

Refresh scheduling will later use mutability plus evidence freshness and business significance. It must not be hard-coded into token identity.

## Missingness and contradiction

Missing knowledge is absence. Genesis T8 must not manufacture a negative token merely because a positive fact is unknown.

Contradiction is explicit knowledge. Contradictory observations may coexist and remain available to TI-2.1.8; newer information must not silently overwrite history.

## Persistence law

Tokens persist facts. Reasoning engines calculate conclusions over current truth-qualified token state.

A Commercial Token must never persist Match Strength, Contact Fit, Route Fit, Opportunity Score, recommendation, or ranking as if those were facts.

## Build 2 freeze boundary

Build 2 freezes:

- the atomic token definition;
- token identity semantics;
- lifecycle semantics;
- mutability classes;
- provenance/evidence ownership boundary;
- TI ownership boundary;
- token/relationship separation;
- missingness and supersession semantics.

Build 2 does **not** freeze:

- the 9 dimensions;
- edge/relationship vocabulary;
- commercial ontology/gene catalogue;
- refresh schedules;
- database persistence schema;
- AI research prompt;
- Commercial Engine mathematics.

Those belong to later CE-R1/CE-R2 builds.

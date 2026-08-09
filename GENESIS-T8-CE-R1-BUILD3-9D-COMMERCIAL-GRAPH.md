# Genesis T8 — Commercial Engine CE-R1 Build 3

## 9D Commercial Graph v1.0

Build 3 formalises how Commercial Tokens from Build 2 inhabit the Genesis T8 knowledge graph. It does **not** change the active MarketRoute production pipeline, database schema, research prompts, schedulers, or TI-2.1.8 mathematics.

## Purpose

The graph is the canonical multidimensional representation of commercial knowledge. A company is not represented as one row, one profile, or one AI narrative. It is represented by atomic truth-qualified tokens, projections of those tokens through nine independent dimensions, and explicit first-class relationships between tokens.

The nine invariant dimensions are:

1. **Semantic** — what a token means and which canonical concepts it belongs to.
2. **Structural** — where the token sits in entity, organisational, ownership, containment, or component structure.
3. **Operational** — how the represented reality participates in operations, process, assets, capacity, flow, or execution.
4. **Commercial** — how the fact participates in buying, selling, revenue, procurement, customer, supplier, or market behaviour. This dimension records commercial facts/categories only; it does not contain Business Fit scores.
5. **Technological** — technology, infrastructure, software, integration, automation, architecture, and digital capability context.
6. **Strategic** — direction, priorities, transformation, expansion, investment, positioning, and strategic state.
7. **Temporal** — when the fact is valid, how it changes, and its relationship to events or periods.
8. **Relational** — how the fact relates to other tokens and entities in the knowledge graph.
9. **Truth** — TI-2.1.8-qualified truth state. This dimension is owned exclusively by TI-2.1.8.

These are **lenses, not buckets**. A warehouse token may simultaneously participate in semantic, structural, operational, commercial, technological, strategic, temporal, relational, and truth dimensions where supported. A token does not get forced into one category.

## Projection model

A token's identity remains exactly as defined in Build 2. Graph position is separate.

Each `GenesisT8DimensionProjection` contains:

- a stable projection ID,
- the token ID,
- one of the nine dimensions,
- one or more canonical coordinates,
- the authority/source responsible for that projection,
- provenance.

Coordinates are canonical ontology labels or references. They are **not opaque model embeddings**, similarity vectors, Match Strength, Opportunity Score, or AI confidence values. This keeps the graph explainable, portable between AI providers, and deterministic for future mathematical engines.

## AI responsibility

AI may:

- discover candidate tokens,
- canonicalise semantics,
- propose non-truth dimensional projections,
- propose relationships between tokens,
- map evidence to propositions.

AI may not:

- assign TI truth probability,
- write the Truth dimension,
- calculate Commercial Fit,
- persist opportunity scores as knowledge,
- turn a recommendation into a factual token.

## TI-2.1.8 responsibility

TI-2.1.8 remains frozen and is the **only authority for the Truth dimension**.

A Truth projection is invalid unless the underlying token already carries a valid TI-2.1.8 qualification. Build 3 does not change TI mathematics, claim logic, evidence mathematics, contradiction handling, coverage, confidence, or decay.

## Deterministic system responsibility

Deterministic code owns:

- the nine-dimension invariant,
- projection and edge validation,
- stable graph IDs,
- allowed ownership boundaries,
- referential integrity,
- graph versioning,
- deterministic traversal ordering,
- preventing derived reasoning from becoming canonical knowledge.

## Relationships

Relationships are first-class graph edges, not embedded properties inside tokens.

Build 3 freezes seven domain-neutral edge classes:

- Association
- Composition
- Dependency
- Influence
- Contradiction
- Temporal
- Equivalence

`relationType` remains a canonical ontology identifier underneath the class. Build 4 will define the Commercial Genome vocabulary rather than prematurely hard-coding hundreds of domain relationships here.

Unknown relationship is represented by **no edge**. It is not automatically represented as a negative relationship.

Contradiction is explicit knowledge and therefore has its own edge class.

## Graph invariants

The graph enforces:

- exactly nine canonical dimensions,
- non-exclusive multidimensional projection,
- graph position separate from token identity,
- canonical coordinates rather than model embeddings,
- TI-only ownership of Truth projections,
- edges connecting existing tokens only,
- no accidental self-edges,
- stable unique token/projection/edge IDs,
- deterministic adjacency ordering,
- no Match Strength or Opportunity outputs in canonical graph knowledge,
- history preserved through token lifecycle and validity rather than destructive overwrite.

## Why this matters

The 9D graph is not itself the Commercial Engine mathematics. It is the substrate those mathematics will reason over.

Future UDOSIB-inspired Commercial Mathematics will be able to traverse the same truth-qualified graph under different objectives and constraints without changing the underlying knowledge. MarketRoute can therefore be one application over Genesis T8 rather than the definition of Genesis T8.

## Build 3 freeze boundary

Build 3 freezes:

- the existence and names of the nine dimensions,
- dimensional projection as a first-class graph object,
- Truth-dimension ownership by TI-2.1.8,
- the domain-neutral edge classes,
- graph referential-integrity rules,
- deterministic traversal as an invariant.

Build 3 deliberately does **not** freeze:

- the complete commercial ontology,
- canonical Commercial Genome predicates,
- detailed relation types,
- refresh schedules,
- Commercial Fit mathematics,
- graph persistence schema,
- AI research prompts.

Those belong to later builds.

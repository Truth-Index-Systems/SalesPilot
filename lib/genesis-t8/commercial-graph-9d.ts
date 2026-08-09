/**
 * Genesis T8 9D Commercial Graph v1.0
 *
 * CE Release 1 / Build 3
 *
 * This module defines how truth-qualified Commercial Tokens inhabit a
 * multidimensional knowledge graph. It does not define Business Fit maths,
 * persistence tables, application UX, or AI research prompts.
 */

import type {
  GenesisT8CommercialToken,
  GenesisT8TokenProvenance,
} from "./token-theory";

export const GENESIS_T8_9D_GRAPH_VERSION = "1.0.0" as const;
export const GENESIS_T8_CE_9D_GRAPH_BUILD = "BUILD3" as const;

/**
 * The nine invariant dimensions of the Commercial Token Graph.
 *
 * Dimensions are independent lenses, not mutually-exclusive buckets. One token
 * may project into many dimensions at once. Dimensional position is not token
 * identity and may evolve without replacing the underlying proposition.
 */
export const GENESIS_T8_COMMERCIAL_DIMENSIONS = Object.freeze([
  "SEMANTIC",
  "STRUCTURAL",
  "OPERATIONAL",
  "COMMERCIAL",
  "TECHNOLOGICAL",
  "STRATEGIC",
  "TEMPORAL",
  "RELATIONAL",
  "TRUTH",
] as const);

export type GenesisT8CommercialDimension =
  (typeof GENESIS_T8_COMMERCIAL_DIMENSIONS)[number];

export type GenesisT8DimensionProjectionSource =
  | "AI_CANONICALISATION"
  | "ONTOLOGY"
  | "DETERMINISTIC"
  | "TI_2_1_8";

/**
 * A projection says how a token participates in one dimension.
 *
 * `coordinates` are stable canonical labels/ontology references, not arbitrary
 * vector embeddings and not commercial scores. Build 4 will populate the
 * vocabulary. A projection can therefore be persisted and explained without
 * coupling the graph to any model provider.
 */
export type GenesisT8DimensionProjection = Readonly<{
  projectionId: string;
  tokenId: string;
  dimension: GenesisT8CommercialDimension;
  coordinates: readonly string[];
  source: GenesisT8DimensionProjectionSource;
  provenance: GenesisT8TokenProvenance;
}>;

/**
 * Graph edges are first-class assertions between existing tokens.
 * The semantic class is intentionally small and domain-neutral; Build 4 can
 * define canonical relation types beneath these classes.
 */
export type GenesisT8GraphEdgeClass =
  | "ASSOCIATION"
  | "COMPOSITION"
  | "DEPENDENCY"
  | "INFLUENCE"
  | "CONTRADICTION"
  | "TEMPORAL"
  | "EQUIVALENCE";

export type GenesisT8GraphDirection = "DIRECTED" | "UNDIRECTED";

export type GenesisT8GraphEdge = Readonly<{
  edgeId: string;
  fromTokenId: string;
  toTokenId: string;
  edgeClass: GenesisT8GraphEdgeClass;
  relationType: string;
  direction: GenesisT8GraphDirection;
  /** Optional validity interval for relationships that themselves change. */
  validFrom?: string;
  validTo?: string;
  provenance: GenesisT8TokenProvenance;
}>;

/**
 * The graph stores knowledge state, never Business Fit or Opportunity output.
 * Derived traversal results are transient and intentionally absent here.
 */
export type GenesisT8CommercialGraph = Readonly<{
  graphVersion: typeof GENESIS_T8_9D_GRAPH_VERSION;
  tokens: readonly GenesisT8CommercialToken[];
  projections: readonly GenesisT8DimensionProjection[];
  edges: readonly GenesisT8GraphEdge[];
}>;

export const GENESIS_T8_9D_GRAPH_LAWS = Object.freeze([
  "EXACTLY_NINE_CANONICAL_DIMENSIONS",
  "DIMENSIONS_ARE_LENSES_NOT_EXCLUSIVE_BUCKETS",
  "TOKEN_IDENTITY_IS_INDEPENDENT_OF_GRAPH_POSITION",
  "ONE_TOKEN_MAY_PROJECT_INTO_MULTIPLE_DIMENSIONS",
  "PROJECTIONS_USE_CANONICAL_COORDINATES_NOT_MODEL_EMBEDDINGS",
  "RELATIONSHIPS_ARE_FIRST_CLASS_EDGES",
  "EDGES_CONNECT_EXISTING_TOKENS_ONLY",
  "SELF_EDGES_ARE_FORBIDDEN_UNLESS_A_FUTURE_VERSION_EXPLICITLY_DEFINES_THEM",
  "GRAPH_NEVER_STORES_MATCH_OR_OPPORTUNITY_SCORES_AS_KNOWLEDGE",
  "GRAPH_TRAVERSAL_IS_DETERMINISTIC_FOR_IDENTICAL_INPUT_STATE",
  "AI_MAY_PROPOSE_SEMANTIC_PROJECTIONS_AND_RELATIONSHIPS",
  "AI_MAY_NOT_WRITE_TRUTH_DIMENSION_OUTPUTS",
  "TI_2_1_8_ALONE_OWNS_TRUTH_DIMENSION_OUTPUTS",
  "TRUTH_PROJECTION_REQUIRES_TI_QUALIFIED_TOKEN",
  "UNKNOWN_RELATIONSHIP_IS_ABSENCE_NOT_NEGATIVE_EDGE",
  "CONTRADICTION_IS_AN_EXPLICIT_EDGE_CLASS",
  "TEMPORAL_CHANGE_PRESERVES_HISTORICAL_GRAPH_STATE",
  "DERIVED_REASONING_IS_RECALCULATED_NOT_CANONISED_AS_FACT",
] as const);

export type GenesisT8GraphLaw = (typeof GENESIS_T8_9D_GRAPH_LAWS)[number];

export const GENESIS_T8_DIMENSION_OWNERSHIP = Object.freeze({
  SEMANTIC: Object.freeze(["AI_CANONICALISATION", "ONTOLOGY"] as const),
  STRUCTURAL: Object.freeze(["AI_CANONICALISATION", "ONTOLOGY", "DETERMINISTIC"] as const),
  OPERATIONAL: Object.freeze(["AI_CANONICALISATION", "ONTOLOGY"] as const),
  COMMERCIAL: Object.freeze(["AI_CANONICALISATION", "ONTOLOGY"] as const),
  TECHNOLOGICAL: Object.freeze(["AI_CANONICALISATION", "ONTOLOGY"] as const),
  STRATEGIC: Object.freeze(["AI_CANONICALISATION", "ONTOLOGY"] as const),
  TEMPORAL: Object.freeze(["AI_CANONICALISATION", "ONTOLOGY", "DETERMINISTIC"] as const),
  RELATIONAL: Object.freeze(["AI_CANONICALISATION", "ONTOLOGY", "DETERMINISTIC"] as const),
  TRUTH: Object.freeze(["TI_2_1_8"] as const),
} satisfies Record<GenesisT8CommercialDimension, readonly GenesisT8DimensionProjectionSource[]>);

export function assertDimensionProjectionInvariant(
  projection: GenesisT8DimensionProjection,
  token?: GenesisT8CommercialToken,
): void {
  if (!projection.projectionId.trim()) {
    throw new Error("GENESIS_T8_9D_VIOLATION:PROJECTION_ID_REQUIRED");
  }
  if (!projection.tokenId.trim()) {
    throw new Error("GENESIS_T8_9D_VIOLATION:TOKEN_ID_REQUIRED");
  }
  if (!GENESIS_T8_COMMERCIAL_DIMENSIONS.includes(projection.dimension)) {
    throw new Error("GENESIS_T8_9D_VIOLATION:UNKNOWN_DIMENSION");
  }
  if (!projection.coordinates.length || projection.coordinates.some((coordinate) => !coordinate.trim())) {
    throw new Error("GENESIS_T8_9D_VIOLATION:CANONICAL_COORDINATE_REQUIRED");
  }
  if (!GENESIS_T8_DIMENSION_OWNERSHIP[projection.dimension].includes(projection.source as never)) {
    throw new Error("GENESIS_T8_9D_VIOLATION:DIMENSION_OWNER");
  }
  if (projection.dimension === "TRUTH") {
    if (projection.source !== "TI_2_1_8") {
      throw new Error("GENESIS_T8_9D_VIOLATION:TRUTH_SOURCE");
    }
    if (token && (!token.truth || token.truth.truthEngineVersion !== "TI-2.1.8")) {
      throw new Error("GENESIS_T8_9D_VIOLATION:TRUTH_PROJECTION_REQUIRES_TI_TOKEN");
    }
  }
}

export function assertGraphEdgeInvariant(edge: GenesisT8GraphEdge): void {
  if (!edge.edgeId.trim()) throw new Error("GENESIS_T8_9D_VIOLATION:EDGE_ID_REQUIRED");
  if (!edge.fromTokenId.trim() || !edge.toTokenId.trim()) {
    throw new Error("GENESIS_T8_9D_VIOLATION:EDGE_ENDPOINT_REQUIRED");
  }
  if (edge.fromTokenId === edge.toTokenId) {
    throw new Error("GENESIS_T8_9D_VIOLATION:SELF_EDGE_FORBIDDEN");
  }
  if (!edge.relationType.trim()) {
    throw new Error("GENESIS_T8_9D_VIOLATION:RELATION_TYPE_REQUIRED");
  }
}

export function assertCommercialGraphInvariant(graph: GenesisT8CommercialGraph): void {
  if (graph.graphVersion !== GENESIS_T8_9D_GRAPH_VERSION) {
    throw new Error("GENESIS_T8_9D_VIOLATION:GRAPH_VERSION");
  }

  const tokenIds = new Set<string>();
  for (const token of graph.tokens) {
    if (tokenIds.has(token.tokenId)) {
      throw new Error("GENESIS_T8_9D_VIOLATION:DUPLICATE_TOKEN_ID");
    }
    tokenIds.add(token.tokenId);
  }

  const projectionIds = new Set<string>();
  for (const projection of graph.projections) {
    if (projectionIds.has(projection.projectionId)) {
      throw new Error("GENESIS_T8_9D_VIOLATION:DUPLICATE_PROJECTION_ID");
    }
    projectionIds.add(projection.projectionId);
    const token = graph.tokens.find((candidate) => candidate.tokenId === projection.tokenId);
    if (!token) throw new Error("GENESIS_T8_9D_VIOLATION:PROJECTION_TOKEN_MISSING");
    assertDimensionProjectionInvariant(projection, token);
  }

  const edgeIds = new Set<string>();
  for (const edge of graph.edges) {
    if (edgeIds.has(edge.edgeId)) {
      throw new Error("GENESIS_T8_9D_VIOLATION:DUPLICATE_EDGE_ID");
    }
    edgeIds.add(edge.edgeId);
    assertGraphEdgeInvariant(edge);
    if (!tokenIds.has(edge.fromTokenId) || !tokenIds.has(edge.toTokenId)) {
      throw new Error("GENESIS_T8_9D_VIOLATION:EDGE_TOKEN_MISSING");
    }
  }
}

/**
 * Deterministic adjacency projection for future reasoning engines. Sorting by
 * stable IDs prevents database/input ordering from changing traversal output.
 */
export function deterministicAdjacentTokenIds(
  graph: GenesisT8CommercialGraph,
  tokenId: string,
): readonly string[] {
  const adjacent = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.fromTokenId === tokenId) adjacent.add(edge.toTokenId);
    if (edge.toTokenId === tokenId) adjacent.add(edge.fromTokenId);
  }
  return Object.freeze([...adjacent].sort((a, b) => a.localeCompare(b)));
}

/** Genesis T8 9D Commercial Graph v1.1 — CE-R1 Build 7 hardening. */
import { GENESIS_T8_ACTIVE_TRUTH_AUTHORITY_ID } from "./authority-registry";
import { assertTemporalInterval, stableFingerprint } from "./canonical-runtime";
import { assertCommercialTokenInvariant, canonicalTokenIdentityKey, type GenesisT8CommercialToken, type GenesisT8TokenProvenance } from "./token-theory";
import { getGenomePredicateDefinition, getPredicateCardinality, predicateDefinitionFingerprint } from "./commercial-genome-ontology";
import { assertRelationshipDefinition, getRelationshipDefinition } from "./relationship-catalogue";

export const GENESIS_T8_9D_GRAPH_VERSION = "1.1.0" as const;
export const GENESIS_T8_CE_9D_GRAPH_BUILD = "BUILD3" as const;
export const GENESIS_T8_COMMERCIAL_DIMENSIONS = Object.freeze(["SEMANTIC","STRUCTURAL","OPERATIONAL","COMMERCIAL","TECHNOLOGICAL","STRATEGIC","TEMPORAL","RELATIONAL","TRUTH"] as const);
export type GenesisT8CommercialDimension = (typeof GENESIS_T8_COMMERCIAL_DIMENSIONS)[number];
export const GENESIS_T8_DIMENSION_PROJECTION_SOURCES = Object.freeze(["AI_CANONICALISATION","ONTOLOGY","DETERMINISTIC","TRUTH_AUTHORITY"] as const);
export type GenesisT8DimensionProjectionSource = (typeof GENESIS_T8_DIMENSION_PROJECTION_SOURCES)[number];

export type GenesisT8DimensionProjection = Readonly<{
  projectionId: string;
  tokenId: string;
  dimension: GenesisT8CommercialDimension;
  coordinates: readonly string[];
  source: GenesisT8DimensionProjectionSource;
  truthAuthorityId?: string;
  derivationReference?: string;
  provenance: GenesisT8TokenProvenance;
}>;

export const GENESIS_T8_GRAPH_EDGE_CLASSES = Object.freeze(["ASSOCIATION","COMPOSITION","DEPENDENCY","INFLUENCE","CONTRADICTION","TEMPORAL","EQUIVALENCE"] as const);
export type GenesisT8GraphEdgeClass = (typeof GENESIS_T8_GRAPH_EDGE_CLASSES)[number];
export const GENESIS_T8_GRAPH_DIRECTIONS = Object.freeze(["DIRECTED","UNDIRECTED"] as const);
export type GenesisT8GraphDirection = (typeof GENESIS_T8_GRAPH_DIRECTIONS)[number];

export type GenesisT8GraphEdge = Readonly<{
  edgeId: string;
  fromTokenId: string;
  toTokenId: string;
  edgeClass: GenesisT8GraphEdgeClass;
  relationType: string;
  direction: GenesisT8GraphDirection;
  validFrom?: string;
  validTo?: string;
  provenance: GenesisT8TokenProvenance;
}>;

export type GenesisT8CommercialGraph = Readonly<{
  graphVersion: typeof GENESIS_T8_9D_GRAPH_VERSION;
  tokens: readonly GenesisT8CommercialToken[];
  projections: readonly GenesisT8DimensionProjection[];
  edges: readonly GenesisT8GraphEdge[];
}>;

export type GenesisT8GraphTemporalScope = "CURRENT_AUTHORITATIVE" | "HISTORICAL" | Readonly<{ asOf: string }>;

export const GENESIS_T8_9D_GRAPH_LAWS = Object.freeze([
  "EXACTLY_NINE_CANONICAL_DIMENSIONS","DIMENSIONS_ARE_LENSES_NOT_EXCLUSIVE_BUCKETS","TOKEN_IDENTITY_IS_INDEPENDENT_OF_GRAPH_POSITION","ONE_TOKEN_MAY_PROJECT_INTO_MULTIPLE_DIMENSIONS","PROJECTIONS_USE_AI_CANONICALISED_OR_ONTOLOGY_COORDINATES_NOT_MODEL_EMBEDDINGS","RELATIONSHIPS_ARE_FIRST_CLASS_EDGES","EDGES_CONNECT_EXISTING_TOKENS_ONLY","SELF_EDGES_ARE_FORBIDDEN_UNLESS_A_FUTURE_VERSION_EXPLICITLY_DEFINES_THEM","GRAPH_NEVER_STORES_MATCH_OR_OPPORTUNITY_SCORES_AS_KNOWLEDGE","GRAPH_TRAVERSAL_IS_DETERMINISTIC_FOR_IDENTICAL_INPUT_STATE","AI_MAY_PROPOSE_SEMANTIC_PROJECTIONS_AND_RELATIONSHIPS","AI_MAY_NOT_WRITE_TRUTH_DIMENSION_PROJECTIONS","TRUTH_DIMENSION_REQUIRES_AUTHORISED_TRUTH_AUTHORITY","CONTRADICTION_IS_AN_EXPLICIT_EDGE_CLASS","TEMPORAL_CHANGE_PRESERVES_HISTORICAL_GRAPH_STATE","DERIVED_REASONING_IS_RECALCULATED_NOT_CANONISED_AS_FACT","SEMANTIC_DUPLICATE_EDGES_AND_PROJECTIONS_ARE_FORBIDDEN","GRAPH_BOUNDARY_REVALIDATES_ALL_TOKENS"
] as const);
export type GenesisT8GraphLaw = (typeof GENESIS_T8_9D_GRAPH_LAWS)[number];

export const GENESIS_T8_DIMENSION_OWNERSHIP = Object.freeze({
  SEMANTIC: ["AI_CANONICALISATION","ONTOLOGY"] as const,
  STRUCTURAL: ["AI_CANONICALISATION","ONTOLOGY","DETERMINISTIC"] as const,
  OPERATIONAL: ["AI_CANONICALISATION","ONTOLOGY"] as const,
  COMMERCIAL: ["AI_CANONICALISATION","ONTOLOGY"] as const,
  TECHNOLOGICAL: ["AI_CANONICALISATION","ONTOLOGY"] as const,
  STRATEGIC: ["AI_CANONICALISATION","ONTOLOGY"] as const,
  TEMPORAL: ["AI_CANONICALISATION","ONTOLOGY","DETERMINISTIC"] as const,
  RELATIONAL: ["AI_CANONICALISATION","ONTOLOGY","DETERMINISTIC"] as const,
  TRUTH: ["TRUTH_AUTHORITY"] as const,
} satisfies Record<GenesisT8CommercialDimension, readonly GenesisT8DimensionProjectionSource[]>);

export function canonicalProjectionIdentityKey(projection: Pick<GenesisT8DimensionProjection,"tokenId"|"dimension"|"coordinates">): string {
  return stableFingerprint([projection.tokenId, projection.dimension, [...new Set(projection.coordinates)].sort().join("\u001f")]);
}

export function canonicalEdgeIdentityKey(edge: Pick<GenesisT8GraphEdge,"fromTokenId"|"toTokenId"|"relationType"|"direction"|"validFrom"|"validTo">): string {
  let from = edge.fromTokenId; let to = edge.toTokenId;
  if (edge.direction === "UNDIRECTED" && from.localeCompare(to) > 0) [from, to] = [to, from];
  return stableFingerprint([from,to,edge.relationType,edge.direction,edge.validFrom ?? "",edge.validTo ?? ""]);
}

export function assertDimensionProjectionInvariant(projection: GenesisT8DimensionProjection, token?: GenesisT8CommercialToken): void {
  if (!projection.projectionId?.trim()) throw new Error("GENESIS_T8_9D_VIOLATION:PROJECTION_ID_REQUIRED");
  if (!projection.tokenId?.trim()) throw new Error("GENESIS_T8_9D_VIOLATION:TOKEN_ID_REQUIRED");
  if (!GENESIS_T8_COMMERCIAL_DIMENSIONS.includes(projection.dimension)) throw new Error("GENESIS_T8_9D_VIOLATION:UNKNOWN_DIMENSION");
  if (!GENESIS_T8_DIMENSION_PROJECTION_SOURCES.includes(projection.source)) throw new Error("GENESIS_T8_9D_VIOLATION:UNKNOWN_PROJECTION_SOURCE");
  if (!projection.coordinates.length || projection.coordinates.some((coordinate) => typeof coordinate !== "string" || !coordinate.trim())) throw new Error("GENESIS_T8_9D_VIOLATION:CANONICAL_COORDINATE_REQUIRED");
  if (new Set(projection.coordinates).size !== projection.coordinates.length) throw new Error("GENESIS_T8_9D_VIOLATION:DUPLICATE_COORDINATE");
  if (!(GENESIS_T8_DIMENSION_OWNERSHIP[projection.dimension] as readonly string[]).includes(projection.source)) throw new Error("GENESIS_T8_9D_VIOLATION:DIMENSION_OWNER");
  if (projection.dimension === "TRUTH") {
    if (projection.source !== "TRUTH_AUTHORITY" || projection.truthAuthorityId !== GENESIS_T8_ACTIVE_TRUTH_AUTHORITY_ID) throw new Error("GENESIS_T8_9D_VIOLATION:TRUTH_SOURCE");
    if (token && (!token.truth || token.truth.truthAuthorityId !== projection.truthAuthorityId)) throw new Error("GENESIS_T8_9D_VIOLATION:TRUTH_PROJECTION_REQUIRES_QUALIFIED_TOKEN");
  } else if (projection.truthAuthorityId) throw new Error("GENESIS_T8_9D_VIOLATION:NON_TRUTH_AUTHORITY_TAG");
}

export function assertGraphEdgeInvariant(edge: GenesisT8GraphEdge): void {
  if (!edge.edgeId?.trim()) throw new Error("GENESIS_T8_9D_VIOLATION:EDGE_ID_REQUIRED");
  if (!edge.fromTokenId?.trim() || !edge.toTokenId?.trim()) throw new Error("GENESIS_T8_9D_VIOLATION:EDGE_ENDPOINT_REQUIRED");
  if (edge.fromTokenId === edge.toTokenId) throw new Error("GENESIS_T8_9D_VIOLATION:SELF_EDGE_FORBIDDEN");
  if (!GENESIS_T8_GRAPH_EDGE_CLASSES.includes(edge.edgeClass)) throw new Error("GENESIS_T8_9D_VIOLATION:EDGE_CLASS");
  if (!GENESIS_T8_GRAPH_DIRECTIONS.includes(edge.direction)) throw new Error("GENESIS_T8_9D_VIOLATION:EDGE_DIRECTION");
  assertRelationshipDefinition(edge.relationType, edge.edgeClass, edge.direction);
  assertTemporalInterval(edge.validFrom, edge.validTo);
}

function isTokenActiveAt(token: GenesisT8CommercialToken, scope: GenesisT8GraphTemporalScope): boolean {
  if (scope === "HISTORICAL") return true;
  if (scope === "CURRENT_AUTHORITATIVE") return token.lifecycle === "ACTIVE";
  const at = Date.parse(scope.asOf); if (!Number.isFinite(at)) throw new Error("GENESIS_T8_9D_VIOLATION:AS_OF");
  const from = token.validFrom ? Date.parse(token.validFrom) : Number.NEGATIVE_INFINITY;
  const to = token.validTo ? Date.parse(token.validTo) : Number.POSITIVE_INFINITY;
  return from <= at && at <= to && token.lifecycle !== "RETIRED";
}

export function assertCommercialGraphInvariant(graph: GenesisT8CommercialGraph): void {
  if (graph.graphVersion !== GENESIS_T8_9D_GRAPH_VERSION) throw new Error("GENESIS_T8_9D_VIOLATION:GRAPH_VERSION");
  const tokenIds = new Set<string>(); const tokenById = new Map<string,GenesisT8CommercialToken>(); const identities = new Set<string>();
  const singleCurrent = new Set<string>();
  for (const token of graph.tokens) {
    assertCommercialTokenInvariant(token);
    if (tokenIds.has(token.tokenId)) throw new Error("GENESIS_T8_9D_VIOLATION:DUPLICATE_TOKEN_ID");
    tokenIds.add(token.tokenId); tokenById.set(token.tokenId, token);
    const identity = canonicalTokenIdentityKey(token); if (identities.has(identity)) throw new Error("GENESIS_T8_9D_VIOLATION:DUPLICATE_TOKEN_PROPOSITION"); identities.add(identity);
    const definition = getGenomePredicateDefinition(token.predicate); if (!definition) throw new Error("GENESIS_T8_9D_VIOLATION:UNKNOWN_TOKEN_PREDICATE");
    if (token.kind !== definition.kind || token.valueType !== definition.valueType || token.mutability !== definition.mutability) throw new Error("GENESIS_T8_9D_VIOLATION:TOKEN_ONTOLOGY_MISMATCH");
    if (token.predicateDefinitionFingerprint !== predicateDefinitionFingerprint(definition)) throw new Error("GENESIS_T8_9D_VIOLATION:PREDICATE_DEFINITION_FINGERPRINT_MISMATCH");
    if (getPredicateCardinality(definition) === "SINGLE_CURRENT" && token.lifecycle === "ACTIVE") {
      const key = `${token.subjectEntityId}|${token.predicate}`; if (singleCurrent.has(key)) throw new Error("GENESIS_T8_9D_VIOLATION:MULTIPLE_ACTIVE_SINGLE_CURRENT"); singleCurrent.add(key);
    }
  }
  for (const token of graph.tokens) {
    if (token.supersededByTokenId) {
      const successor = tokenById.get(token.supersededByTokenId);
      if (!successor) throw new Error("GENESIS_T8_9D_VIOLATION:SUPERSESSION_TARGET_MISSING");
      if (successor.subjectEntityId !== token.subjectEntityId || successor.predicate !== token.predicate) throw new Error("GENESIS_T8_9D_VIOLATION:SUPERSESSION_SCOPE_MISMATCH");
    }
  }
  const projectionIds = new Set<string>(); const projectionKeys = new Set<string>();
  for (const projection of graph.projections) {
    if (projectionIds.has(projection.projectionId)) throw new Error("GENESIS_T8_9D_VIOLATION:DUPLICATE_PROJECTION_ID"); projectionIds.add(projection.projectionId);
    const token = tokenById.get(projection.tokenId); if (!token) throw new Error("GENESIS_T8_9D_VIOLATION:PROJECTION_TOKEN_MISSING");
    assertDimensionProjectionInvariant(projection, token);
    const key = canonicalProjectionIdentityKey(projection); if (projectionKeys.has(key)) throw new Error("GENESIS_T8_9D_VIOLATION:DUPLICATE_PROJECTION_SEMANTICS"); projectionKeys.add(key);
  }
  const edgeIds = new Set<string>(); const edgeKeys = new Set<string>();
  for (const edge of graph.edges) {
    if (edgeIds.has(edge.edgeId)) throw new Error("GENESIS_T8_9D_VIOLATION:DUPLICATE_EDGE_ID"); edgeIds.add(edge.edgeId);
    assertGraphEdgeInvariant(edge); if (!tokenIds.has(edge.fromTokenId) || !tokenIds.has(edge.toTokenId)) throw new Error("GENESIS_T8_9D_VIOLATION:EDGE_TOKEN_MISSING");
    const key = canonicalEdgeIdentityKey(edge); if (edgeKeys.has(key)) throw new Error("GENESIS_T8_9D_VIOLATION:DUPLICATE_EDGE_SEMANTICS"); edgeKeys.add(key);
    const from = tokenById.get(edge.fromTokenId)!; const to = tokenById.get(edge.toTokenId)!;
    if (edge.relationType === "supersedes" && (from.subjectEntityId !== to.subjectEntityId || from.predicate !== to.predicate)) throw new Error("GENESIS_T8_9D_VIOLATION:SUPERSESSION_SCOPE_MISMATCH");
  }
  // Acyclic relation classes are validated independently so legitimate commercial cycles remain allowed.
  for (const relation of new Set(graph.edges.map((edge) => edge.relationType))) {
    const def = getRelationshipDefinition(relation); if (!def || def.topology === "CYCLES_ALLOWED") continue;
    const edges = graph.edges.filter((edge) => edge.relationType === relation);
    const outgoing = new Map<string,string[]>(); for (const edge of edges) outgoing.set(edge.fromTokenId, [...(outgoing.get(edge.fromTokenId) ?? []), edge.toTokenId]);
    const visiting = new Set<string>(); const visited = new Set<string>();
    const dfs=(id:string):void=>{ if(visiting.has(id)) throw new Error(`GENESIS_T8_9D_VIOLATION:ACYCLIC_RELATION_CYCLE:${relation}`); if(visited.has(id)) return; visiting.add(id); for(const next of outgoing.get(id)??[]) dfs(next); visiting.delete(id); visited.add(id); };
    for (const id of outgoing.keys()) dfs(id);
  }
}

export function deterministicAdjacentTokenIds(graph: GenesisT8CommercialGraph, tokenId: string, scope: GenesisT8GraphTemporalScope = "CURRENT_AUTHORITATIVE"): readonly string[] {
  const tokenById = new Map(graph.tokens.map((token) => [token.tokenId, token])); const adjacent = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.fromTokenId === tokenId && tokenById.get(edge.toTokenId) && isTokenActiveAt(tokenById.get(edge.toTokenId)!, scope)) adjacent.add(edge.toTokenId);
    if (edge.toTokenId === tokenId && tokenById.get(edge.fromTokenId) && isTokenActiveAt(tokenById.get(edge.fromTokenId)!, scope)) adjacent.add(edge.fromTokenId);
  }
  return Object.freeze([...adjacent].sort((a,b)=>a.localeCompare(b)));
}

export function deterministicOutgoingTokenIds(graph: GenesisT8CommercialGraph, tokenId: string, scope: GenesisT8GraphTemporalScope = "CURRENT_AUTHORITATIVE"): readonly string[] {
  const tokenById = new Map(graph.tokens.map((token) => [token.tokenId, token])); return Object.freeze([...new Set(graph.edges.filter((edge)=>edge.fromTokenId===tokenId && isTokenActiveAt(tokenById.get(edge.toTokenId)!,scope)).map((edge)=>edge.toTokenId))].sort());
}
export function deterministicIncomingTokenIds(graph: GenesisT8CommercialGraph, tokenId: string, scope: GenesisT8GraphTemporalScope = "CURRENT_AUTHORITATIVE"): readonly string[] {
  const tokenById = new Map(graph.tokens.map((token) => [token.tokenId, token])); return Object.freeze([...new Set(graph.edges.filter((edge)=>edge.toTokenId===tokenId && isTokenActiveAt(tokenById.get(edge.fromTokenId)!,scope)).map((edge)=>edge.fromTokenId))].sort());
}

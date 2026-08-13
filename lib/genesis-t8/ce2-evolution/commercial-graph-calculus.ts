/**
 * Genesis T8 CE2 Evolution R7 — Commercial Graph Calculus.
 *
 * Research-led additive evolution over frozen CE-R2 v1 and CE2 R1-R6.
 * R7 models commercial path structure without scalar route weights:
 *   - deterministic directed reachability;
 *   - Pareto multi-objective path reasoning;
 *   - bottleneck (weakest-link) path stability;
 *   - Menger-style internally vertex-disjoint path robustness;
 *   - source/target-specific critical node and edge identification.
 *
 * The calculus does NOT assign semantic relationships, truth, opportunity scores,
 * route scores, contact scores, or arbitrary exchange rates between path criteria.
 * AI may identify/canonicalise semantic nodes and relationships upstream only.
 */

import { assertRelationshipDefinition } from "../relationship-catalogue";
import type { GenesisT8GraphDirection, GenesisT8GraphEdgeClass } from "../commercial-graph-9d";

export const GENESIS_T8_CE2_EVOLUTION_R7_VERSION = "1.0.0" as const;
export const GENESIS_T8_CE2_EVOLUTION_R7_BUILD = "CE2-R7-FB5" as const;

export const GENESIS_T8_COMMERCIAL_PATH_EDGE_STATES = Object.freeze([
  "OPEN",
  "UNRESOLVED",
  "BLOCKED",
] as const);
export type GenesisT8CommercialPathEdgeState = (typeof GENESIS_T8_COMMERCIAL_PATH_EDGE_STATES)[number];

export type GenesisT8CommercialPathNode = Readonly<{
  nodeId: string;
  referencedTokenIds: readonly string[];
}>;

/**
 * stabilityMargin is an optional deterministic upstream margin in [0,1].
 * null means the edge has no authorised stability margin and is never guessed.
 */
export type GenesisT8CommercialPathEdge = Readonly<{
  edgeId: string;
  fromNodeId: string;
  toNodeId: string;
  sourceRelationshipId: string;
  /** Build 5: when present the decision edge is explicitly bound to the canonical Genesis relationship ontology. */
  canonicalRelationship?: Readonly<{
    relationType: string;
    edgeClass: GenesisT8GraphEdgeClass;
    direction: GenesisT8GraphDirection;
  }>;
  state: GenesisT8CommercialPathEdgeState;
  stabilityMargin: number | null;
}>;

export type GenesisT8CommercialDecisionGraph = Readonly<{
  realityId: string;
  nodes: readonly GenesisT8CommercialPathNode[];
  edges: readonly GenesisT8CommercialPathEdge[];
}>;

export type GenesisT8GraphEvaluationLimits = Readonly<{
  /** Computational guard only. Hitting it fails closed; results are never silently truncated. */
  maxSimplePaths: number;
  maxPathDepth: number;
}>;

export type GenesisT8CommercialPath = Readonly<{
  pathState: GenesisT8CommercialPathEdgeState;
  nodeIds: readonly string[];
  edgeIds: readonly string[];
  blockedEdgeCount: number;
  unresolvedEdgeCount: number;
  hopCount: number;
  /** Minimum known stability margin on the path; null when no edge has an authorised margin. */
  bottleneckStabilityMargin: number | null;
}>;

export type GenesisT8CommercialGraphAssessment = Readonly<{
  realityId: string;
  sourceNodeId: string;
  targetNodeId: string;
  currentReachable: boolean;
  structuralReachable: boolean;
  shortestOpenHopCount: number | null;
  paretoPaths: readonly GenesisT8CommercialPath[];
  openParetoPaths: readonly GenesisT8CommercialPath[];
  internallyVertexDisjointOpenPathCount: number;
  robustnessClass: "NO_OPEN_PATH" | "SINGLE_CRITICAL_PATH" | "REDUNDANT_TWO_PATHS" | "REDUNDANT_THREE_PLUS_PATHS";
  criticalNodeIds: readonly string[];
  criticalEdgeIds: readonly string[];
  deterministicReasons: readonly string[];
}>;

const canonicalId = (value: string, code: string): string => {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) throw new Error(`GENESIS_T8_CE2_R7_VIOLATION:${code}`);
  return value;
};

function uniqueSorted(values: readonly string[], code: string): readonly string[] {
  const copy = values.map((value) => canonicalId(value, code));
  if (new Set(copy).size !== copy.length) throw new Error(`GENESIS_T8_CE2_R7_VIOLATION:DUPLICATE_${code}`);
  return Object.freeze([...copy].sort((a, b) => a.localeCompare(b)));
}

export function assertCommercialDecisionGraphInvariant(graph: GenesisT8CommercialDecisionGraph): void {
  canonicalId(graph.realityId, "REALITY_ID");
  if (!graph.nodes.length) throw new Error("GENESIS_T8_CE2_R7_VIOLATION:EMPTY_NODES");
  const nodeIds = new Set<string>();
  for (const node of graph.nodes) {
    canonicalId(node.nodeId, "NODE_ID");
    if (nodeIds.has(node.nodeId)) throw new Error("GENESIS_T8_CE2_R7_VIOLATION:DUPLICATE_NODE_ID");
    nodeIds.add(node.nodeId);
    uniqueSorted(node.referencedTokenIds, "TOKEN_ID");
    for (const forbidden of ["score", "weight", "priority", "importance", "probability", "confidence", "rank"]) {
      if (Object.prototype.hasOwnProperty.call(node as object, forbidden)) throw new Error(`GENESIS_T8_CE2_R7_VIOLATION:NODE_AUTHORITY_LEAK:${forbidden}`);
    }
  }
  const edgeIds = new Set<string>();
  for (const edge of graph.edges) {
    canonicalId(edge.edgeId, "EDGE_ID");
    if (edgeIds.has(edge.edgeId)) throw new Error("GENESIS_T8_CE2_R7_VIOLATION:DUPLICATE_EDGE_ID");
    edgeIds.add(edge.edgeId);
    canonicalId(edge.fromNodeId, "EDGE_FROM");
    canonicalId(edge.toNodeId, "EDGE_TO");
    canonicalId(edge.sourceRelationshipId, "SOURCE_RELATIONSHIP_ID");
    if (edge.canonicalRelationship) {
      assertRelationshipDefinition(edge.canonicalRelationship.relationType, edge.canonicalRelationship.edgeClass, edge.canonicalRelationship.direction);
    }
    if (!nodeIds.has(edge.fromNodeId) || !nodeIds.has(edge.toNodeId)) throw new Error("GENESIS_T8_CE2_R7_VIOLATION:EDGE_ENDPOINT_MISSING");
    if (edge.fromNodeId === edge.toNodeId) throw new Error("GENESIS_T8_CE2_R7_VIOLATION:SELF_EDGE");
    if (!(GENESIS_T8_COMMERCIAL_PATH_EDGE_STATES as readonly string[]).includes(edge.state)) throw new Error("GENESIS_T8_CE2_R7_VIOLATION:EDGE_STATE");
    if (edge.stabilityMargin !== null && (!Number.isFinite(edge.stabilityMargin) || edge.stabilityMargin < 0 || edge.stabilityMargin > 1)) {
      throw new Error("GENESIS_T8_CE2_R7_VIOLATION:STABILITY_MARGIN");
    }
    for (const forbidden of ["score", "weight", "priority", "importance", "probability", "confidence", "rank", "utility"]) {
      if (Object.prototype.hasOwnProperty.call(edge as object, forbidden)) throw new Error(`GENESIS_T8_CE2_R7_VIOLATION:EDGE_AUTHORITY_LEAK:${forbidden}`);
    }
  }
}

export function assertGraphEvaluationLimitsInvariant(limits: GenesisT8GraphEvaluationLimits): void {
  if (!Number.isInteger(limits.maxSimplePaths) || limits.maxSimplePaths < 1) throw new Error("GENESIS_T8_CE2_R7_VIOLATION:MAX_SIMPLE_PATHS");
  if (!Number.isInteger(limits.maxPathDepth) || limits.maxPathDepth < 1) throw new Error("GENESIS_T8_CE2_R7_VIOLATION:MAX_PATH_DEPTH");
}

function canonicalEdges(graph: GenesisT8CommercialDecisionGraph, allowed: ReadonlySet<GenesisT8CommercialPathEdgeState>): readonly GenesisT8CommercialPathEdge[] {
  return Object.freeze(graph.edges.filter((edge) => allowed.has(edge.state)).sort((a, b) => a.edgeId.localeCompare(b.edgeId)));
}

function outgoing(edges: readonly GenesisT8CommercialPathEdge[]): ReadonlyMap<string, readonly GenesisT8CommercialPathEdge[]> {
  const map = new Map<string, GenesisT8CommercialPathEdge[]>();
  for (const edge of edges) {
    const list = map.get(edge.fromNodeId) ?? [];
    list.push(edge);
    map.set(edge.fromNodeId, list);
  }
  for (const [nodeId, list] of map) map.set(nodeId, list.sort((a, b) => a.edgeId.localeCompare(b.edgeId)));
  return map;
}

export function isCommerciallyReachable(
  graph: GenesisT8CommercialDecisionGraph,
  sourceNodeId: string,
  targetNodeId: string,
  allowedStates: readonly GenesisT8CommercialPathEdgeState[] = ["OPEN"],
): boolean {
  assertCommercialDecisionGraphInvariant(graph);
  canonicalId(sourceNodeId, "SOURCE_NODE_ID");
  canonicalId(targetNodeId, "TARGET_NODE_ID");
  const nodeIds = new Set(graph.nodes.map((node) => node.nodeId));
  if (!nodeIds.has(sourceNodeId) || !nodeIds.has(targetNodeId)) throw new Error("GENESIS_T8_CE2_R7_VIOLATION:QUERY_NODE_MISSING");
  if (sourceNodeId === targetNodeId) return true;
  const allowed = new Set(allowedStates);
  const byFrom = outgoing(canonicalEdges(graph, allowed));
  const queue = [sourceNodeId];
  const seen = new Set(queue);
  while (queue.length) {
    const current = queue.shift()!;
    for (const edge of byFrom.get(current) ?? []) {
      if (edge.toNodeId === targetNodeId) return true;
      if (!seen.has(edge.toNodeId)) { seen.add(edge.toNodeId); queue.push(edge.toNodeId); }
    }
  }
  return false;
}

export function shortestOpenHopCount(graph: GenesisT8CommercialDecisionGraph, sourceNodeId: string, targetNodeId: string): number | null {
  assertCommercialDecisionGraphInvariant(graph);
  if (sourceNodeId === targetNodeId) return 0;
  const byFrom = outgoing(canonicalEdges(graph, new Set(["OPEN"])));
  const queue: Array<readonly [string, number]> = [[sourceNodeId, 0]];
  const seen = new Set([sourceNodeId]);
  while (queue.length) {
    const [current, distance] = queue.shift()!;
    for (const edge of byFrom.get(current) ?? []) {
      if (edge.toNodeId === targetNodeId) return distance + 1;
      if (!seen.has(edge.toNodeId)) { seen.add(edge.toNodeId); queue.push([edge.toNodeId, distance + 1]); }
    }
  }
  return null;
}

function pathFromEdges(sourceNodeId: string, edges: readonly GenesisT8CommercialPathEdge[]): GenesisT8CommercialPath {
  const knownMargins = edges.map((edge) => edge.stabilityMargin).filter((value): value is number => value !== null);
  const pathState: GenesisT8CommercialPathEdgeState = edges.some((edge) => edge.state === "BLOCKED") ? "BLOCKED" : edges.some((edge) => edge.state === "UNRESOLVED") ? "UNRESOLVED" : "OPEN";
  return Object.freeze({
    pathState,
    nodeIds: Object.freeze([sourceNodeId, ...edges.map((edge) => edge.toNodeId)]),
    edgeIds: Object.freeze(edges.map((edge) => edge.edgeId)),
    blockedEdgeCount: edges.filter((edge) => edge.state === "BLOCKED").length,
    unresolvedEdgeCount: edges.filter((edge) => edge.state === "UNRESOLVED").length,
    hopCount: edges.length,
    bottleneckStabilityMargin: knownMargins.length ? Math.min(...knownMargins) : null,
  });
}

/** Enumerates simple directed structural paths. Complexity limits fail closed. */
export function enumerateCommercialSimplePaths(
  graph: GenesisT8CommercialDecisionGraph,
  sourceNodeId: string,
  targetNodeId: string,
  limits: GenesisT8GraphEvaluationLimits,
): readonly GenesisT8CommercialPath[] {
  assertCommercialDecisionGraphInvariant(graph);
  assertGraphEvaluationLimitsInvariant(limits);
  const byFrom = outgoing(canonicalEdges(graph, new Set(GENESIS_T8_COMMERCIAL_PATH_EDGE_STATES)));
  const results: GenesisT8CommercialPath[] = [];
  const visit = (current: string, visited: ReadonlySet<string>, edges: readonly GenesisT8CommercialPathEdge[]): void => {
    if (edges.length > limits.maxPathDepth) return;
    if (current === targetNodeId) {
      results.push(pathFromEdges(sourceNodeId, edges));
      if (results.length > limits.maxSimplePaths) throw new Error("GENESIS_T8_CE2_R7_VIOLATION:PATH_COMPLEXITY_LIMIT");
      return;
    }
    if (edges.length === limits.maxPathDepth) return;
    for (const edge of byFrom.get(current) ?? []) {
      if (visited.has(edge.toNodeId)) continue;
      const nextVisited = new Set(visited); nextVisited.add(edge.toNodeId);
      visit(edge.toNodeId, nextVisited, [...edges, edge]);
    }
  };
  visit(sourceNodeId, new Set([sourceNodeId]), []);
  return Object.freeze(results.sort((a, b) => a.edgeIds.join("\u001f").localeCompare(b.edgeIds.join("\u001f"))));
}

function marginAtLeast(a: number | null, b: number | null): boolean {
  if (b === null) return true;
  if (a === null) return false;
  return a >= b;
}
function marginStrictlyGreater(a: number | null, b: number | null): boolean {
  if (a === null) return false;
  if (b === null) return true;
  return a > b;
}

/**
 * Pareto dominance uses no exchange rates:
 * fewer blocked edges, fewer unresolved edges, fewer hops, and a no-worse
 * bottleneck stability margin. At least one criterion must be strictly better.
 */
export function commercialPathDominates(a: GenesisT8CommercialPath, b: GenesisT8CommercialPath): boolean {
  const precedence: Readonly<Record<GenesisT8CommercialPathEdgeState, number>> = Object.freeze({ BLOCKED: 0, UNRESOLVED: 1, OPEN: 2 });
  if (a.pathState !== b.pathState) return precedence[a.pathState] > precedence[b.pathState];
  const noWorse = a.blockedEdgeCount <= b.blockedEdgeCount
    && a.unresolvedEdgeCount <= b.unresolvedEdgeCount
    && a.hopCount <= b.hopCount
    && marginAtLeast(a.bottleneckStabilityMargin, b.bottleneckStabilityMargin);
  const strict = a.blockedEdgeCount < b.blockedEdgeCount
    || a.unresolvedEdgeCount < b.unresolvedEdgeCount
    || a.hopCount < b.hopCount
    || marginStrictlyGreater(a.bottleneckStabilityMargin, b.bottleneckStabilityMargin);
  return noWorse && strict;
}

export function paretoCommercialPaths(paths: readonly GenesisT8CommercialPath[]): readonly GenesisT8CommercialPath[] {
  return Object.freeze(paths
    .filter((candidate, index) => !paths.some((other, otherIndex) => otherIndex !== index && commercialPathDominates(other, candidate)))
    .sort((a, b) => a.edgeIds.join("\u001f").localeCompare(b.edgeIds.join("\u001f"))));
}

/**
 * Deterministic Edmonds-Karp on a node-split OPEN graph. Internal node capacity
 * is one, so the max flow equals the number of internally vertex-disjoint paths
 * under the finite unit-edge model used here.
 */
export function internallyVertexDisjointOpenPathCount(graph: GenesisT8CommercialDecisionGraph, sourceNodeId: string, targetNodeId: string): number {
  assertCommercialDecisionGraphInvariant(graph);
  const openEdges = canonicalEdges(graph, new Set(["OPEN"]));
  if (!isCommerciallyReachable(graph, sourceNodeId, targetNodeId, ["OPEN"])) return 0;
  const capacity = new Map<string, Map<string, number>>();
  const add = (u: string, v: string, cap: number): void => {
    const row = capacity.get(u) ?? new Map<string, number>();
    row.set(v, (row.get(v) ?? 0) + cap); capacity.set(u, row);
    const rev = capacity.get(v) ?? new Map<string, number>(); if (!rev.has(u)) rev.set(u, 0); capacity.set(v, rev);
  };
  const nodeIds = graph.nodes.map((node) => node.nodeId).sort((a, b) => a.localeCompare(b));
  for (const id of nodeIds) add(`${id}:in`, `${id}:out`, id === sourceNodeId || id === targetNodeId ? Math.max(1, openEdges.length) : 1);
  for (const edge of openEdges) add(`${edge.fromNodeId}:out`, `${edge.toNodeId}:in`, 1);
  const source = `${sourceNodeId}:out`, sink = `${targetNodeId}:in`;
  let flow = 0;
  while (true) {
    const parent = new Map<string, string>();
    const queue = [source]; const seen = new Set([source]);
    while (queue.length && !seen.has(sink)) {
      const u = queue.shift()!;
      const neighbors = [...(capacity.get(u)?.entries() ?? [])].filter(([, cap]) => cap > 0).sort(([a], [b]) => a.localeCompare(b));
      for (const [v] of neighbors) if (!seen.has(v)) { seen.add(v); parent.set(v, u); queue.push(v); }
    }
    if (!seen.has(sink)) break;
    let v = sink;
    while (v !== source) {
      const u = parent.get(v)!;
      capacity.get(u)!.set(v, capacity.get(u)!.get(v)! - 1);
      capacity.get(v)!.set(u, (capacity.get(v)!.get(u) ?? 0) + 1);
      v = u;
    }
    flow += 1;
  }
  return flow;
}

function graphWithoutNode(graph: GenesisT8CommercialDecisionGraph, nodeId: string): GenesisT8CommercialDecisionGraph {
  return Object.freeze({
    realityId: graph.realityId,
    nodes: Object.freeze(graph.nodes.filter((node) => node.nodeId !== nodeId)),
    edges: Object.freeze(graph.edges.filter((edge) => edge.fromNodeId !== nodeId && edge.toNodeId !== nodeId)),
  });
}
function graphWithoutEdge(graph: GenesisT8CommercialDecisionGraph, edgeId: string): GenesisT8CommercialDecisionGraph {
  return Object.freeze({ realityId: graph.realityId, nodes: graph.nodes, edges: Object.freeze(graph.edges.filter((edge) => edge.edgeId !== edgeId)) });
}

export function criticalOpenNodeIds(graph: GenesisT8CommercialDecisionGraph, sourceNodeId: string, targetNodeId: string): readonly string[] {
  if (!isCommerciallyReachable(graph, sourceNodeId, targetNodeId, ["OPEN"])) return Object.freeze([]);
  return Object.freeze(graph.nodes.map((node) => node.nodeId)
    .filter((id) => id !== sourceNodeId && id !== targetNodeId)
    .filter((id) => !isCommerciallyReachable(graphWithoutNode(graph, id), sourceNodeId, targetNodeId, ["OPEN"]))
    .sort((a, b) => a.localeCompare(b)));
}

export function criticalOpenEdgeIds(graph: GenesisT8CommercialDecisionGraph, sourceNodeId: string, targetNodeId: string): readonly string[] {
  if (!isCommerciallyReachable(graph, sourceNodeId, targetNodeId, ["OPEN"])) return Object.freeze([]);
  return Object.freeze(graph.edges.filter((edge) => edge.state === "OPEN")
    .filter((edge) => !isCommerciallyReachable(graphWithoutEdge(graph, edge.edgeId), sourceNodeId, targetNodeId, ["OPEN"]))
    .map((edge) => edge.edgeId).sort((a, b) => a.localeCompare(b)));
}

export function evaluateCommercialGraph(
  graph: GenesisT8CommercialDecisionGraph,
  sourceNodeId: string,
  targetNodeId: string,
  limits: GenesisT8GraphEvaluationLimits,
): GenesisT8CommercialGraphAssessment {
  assertCommercialDecisionGraphInvariant(graph);
  assertGraphEvaluationLimitsInvariant(limits);
  const paths = enumerateCommercialSimplePaths(graph, sourceNodeId, targetNodeId, limits);
  const paretoPaths = paretoCommercialPaths(paths);
  const openParetoPaths = Object.freeze(paretoPaths.filter((path) => path.pathState === "OPEN"));
  const currentReachable = isCommerciallyReachable(graph, sourceNodeId, targetNodeId, ["OPEN"]);
  const structuralReachable = paths.length > 0;
  const disjoint = internallyVertexDisjointOpenPathCount(graph, sourceNodeId, targetNodeId);
  const robustnessClass = disjoint === 0 ? "NO_OPEN_PATH" : disjoint === 1 ? "SINGLE_CRITICAL_PATH" : disjoint === 2 ? "REDUNDANT_TWO_PATHS" : "REDUNDANT_THREE_PLUS_PATHS";
  const criticalNodeIds = criticalOpenNodeIds(graph, sourceNodeId, targetNodeId);
  const criticalEdgeIds = criticalOpenEdgeIds(graph, sourceNodeId, targetNodeId);
  const shortest = shortestOpenHopCount(graph, sourceNodeId, targetNodeId);
  return Object.freeze({
    realityId: graph.realityId,
    sourceNodeId,
    targetNodeId,
    currentReachable,
    structuralReachable,
    shortestOpenHopCount: shortest,
    paretoPaths,
    openParetoPaths,
    internallyVertexDisjointOpenPathCount: disjoint,
    robustnessClass,
    criticalNodeIds,
    criticalEdgeIds,
    deterministicReasons: Object.freeze([
      `CURRENT_REACHABLE:${currentReachable}`,
      `STRUCTURAL_REACHABLE:${structuralReachable}`,
      `SHORTEST_OPEN_HOPS:${shortest === null ? "NONE" : shortest}`,
      `PARETO_PATH_COUNT:${paretoPaths.length}`,
      `OPEN_PARETO_PATH_COUNT:${openParetoPaths.length}`,
      `INTERNALLY_VERTEX_DISJOINT_OPEN_PATHS:${disjoint}`,
      `ROBUSTNESS_CLASS:${robustnessClass}`,
      `CRITICAL_NODES:${criticalNodeIds.join(",") || "NONE"}`,
      `CRITICAL_EDGES:${criticalEdgeIds.join(",") || "NONE"}`,
    ]),
  });
}

export const GENESIS_T8_CE2_R7_GRAPH_LAWS = Object.freeze([
  "COMMERCIAL_REACHABILITY_IS_A_GRAPH_PROPERTY_NOT_AN_AI_JUDGEMENT",
  "CURRENT_REACHABILITY_USES_OPEN_EDGES_ONLY",
  "STRUCTURAL_REACHABILITY_MAY_EXIST_WHILE_CURRENT_REACHABILITY_IS_BLOCKED",
  "SCALAR_WEIGHTED_SHORTEST_PATHS_ARE_FORBIDDEN_WITHOUT_CONSTITUTIONAL_EXCHANGE_RATES",
  "PATH_ACCESSIBILITY_IS_CATEGORICAL_AND_NON_COMPENSATORY_OPEN_THEN_UNRESOLVED_THEN_BLOCKED",
  "PARETO_PATH_REASONING_PRESERVES_INCOMPARABLE_COMMERCIAL_TRADEOFFS_WITHIN_EQUAL_ACCESSIBILITY_CLASS",
  "BOTTLENECK_MARGIN_REPRESENTS_WEAKEST_LINK_STABILITY_AND_IS_NEVER_AVERAGED",
  "UNKNOWN_STABILITY_MARGIN_IS_NOT_ASSUMED_ZERO_OR_ONE",
  "SHORTEST_HOP_COUNT_IS_DESCRIPTIVE_AND_DOES_NOT_ALONE_RANK_COMMERCIAL_ROUTES",
  "MENGER_STYLE_DISJOINT_PATH_REASONING_GOVERNS_STRUCTURAL_ROUTE_REDUNDANCY",
  "CRITICAL_NODES_AND_EDGES_ARE_SOURCE_TARGET_SPECIFIC_REMOVAL_TESTS_NOT_GENERIC_CENTRALITY_SCORES",
  "PATH_ENUMERATION_COMPLEXITY_LIMITS_FAIL_CLOSED_AND_NEVER_SILENTLY_TRUNCATE_THE_PARETO_FRONT",
  "AI_MAY_CANONICALISE_SEMANTIC_GRAPH_RELATIONSHIPS_BUT_MAY_NOT_ASSIGN_PATH_WEIGHTS_SCORES_OR_RANKS",
  "TRUTH_REMAINS_OWNED_BY_TRUTH_INDEX_AND_IS_NOT_RECALCULATED_BY_GRAPH_TRAVERSAL",
  "CE2_R7_DOES_NOT_RANK_OPPORTUNITIES_CONTACTS_OR_RESEARCH",
] as const);

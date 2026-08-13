import {
  evaluateCommercialGraph,
  type GenesisT8CommercialDecisionGraph,
  type GenesisT8CommercialPathEdge,
} from "../ce2-evolution/commercial-graph-calculus";
import { assertRelationshipDefinition, getRelationshipDefinition } from "../relationship-catalogue";
import type { GenesisT8GraphDirection, GenesisT8GraphEdgeClass } from "../commercial-graph-9d";

export const GENESIS_T8_CIE_R5_VERSION = "3.0.0" as const;
export const GENESIS_T8_CIE_R5_BUILD = "CIE-R5-FB5" as const;
export const GENESIS_T8_CIE_R5_AUTHORITY_MODE = "AUTHORITATIVE" as const;
export const GENESIS_T8_CIE_R5_ROUTE_EVIDENCE_SEMANTICS = "MR-T8-FB5-CANONICAL-RELATIONSHIP-GRAPH-1.0.0" as const;
export const GENESIS_T8_CIE_R5_PRODUCER_VERSION = "MR-T8-FB5-R5-1.0.0" as const;

export type CieR5ExecutionChannel = "EMAIL" | "LINKEDIN" | "SWITCHBOARD" | "REFERRAL";
export type CieR5RouteState = "OPEN" | "UNRESOLVED" | "BLOCKED";

export type CieR5RouteDecision = Readonly<{
  routeId: string;
  executionChannel: CieR5ExecutionChannel;
  selectionReason: string;
  commercialFriction: "LOW" | "MEDIUM" | "HIGH";
  expectedCommitment: string;
}>;

export type CieR5ChannelStrategy = Readonly<{
  schemaVersion: "g5-channel-strategy/v1";
  promptVersion: "cie-r5-route-authority/v3";
  primary: CieR5RouteDecision;
  secondary: CieR5RouteDecision | null;
  fallback: CieR5RouteDecision | null;
  sequenceRationale: string;
  primaryWhyNow: string;
  alternativesNotFirst: readonly Readonly<{ routeId: string; reason: string }>[];
  channelConfidence: number;
  limitations: readonly string[];
}>;

const CHANNEL_COMPATIBILITY: Readonly<Record<string, CieR5ExecutionChannel | null>> = Object.freeze({
  DIRECT_EMAIL: "EMAIL",
  DEPARTMENT_EMAIL: "EMAIL",
  GENERAL_EMAIL: "EMAIL",
  LINKEDIN: "LINKEDIN",
  SWITCHBOARD: "SWITCHBOARD",
  INTRODUCTION: "REFERRAL",
  UNKNOWN: null,
});

type RouteEvidence = Readonly<{
  evidenceType?: unknown;
  claim?: unknown;
  sourceUrl?: unknown;
  excerpt?: unknown;
  verified?: unknown;
  excerptMatched?: unknown;
}>;

type RouteTruth = Readonly<{
  id?: unknown;
  routeType?: unknown;
  label?: unknown;
  entryRole?: unknown;
  department?: unknown;
  contactName?: unknown;
  contactRole?: unknown;
  targetRole?: unknown;
  channelType?: unknown;
  channelValue?: unknown;
  routeSemanticsVersion?: unknown;
  evidence?: unknown;
}>;

type CanonicalRelationshipTruth = Readonly<{
  id?: unknown;
  relationType?: unknown;
  edgeClass?: unknown;
  direction?: unknown;
  fromNodeId?: unknown;
  fromEntityKind?: unknown;
  fromLabel?: unknown;
  fromCanonicalDomain?: unknown;
  toNodeId?: unknown;
  toEntityKind?: unknown;
  toLabel?: unknown;
  toCanonicalDomain?: unknown;
  authorityState?: unknown;
  state?: unknown;
  evidence?: unknown;
}>;

export type AuthoritativeRoute = Readonly<{
  id: string;
  routeType: string;
  label: string | null;
  entryRole: string | null;
  department: string | null;
  contactName: string | null;
  contactRole: string | null;
  targetRole: string | null;
  channelType: string;
  channelValue: string | null;
  executionChannel: CieR5ExecutionChannel | null;
  channelState: CieR5RouteState;
  structuralState: CieR5RouteState;
  edgeState: CieR5RouteState;
  evidenceSupport: "CHANNEL_VALUE_SUPPORTED" | "CHANNEL_VALUE_UNSUPPORTED" | "CHANNEL_UNRESOLVED";
  structuralRelationship: Readonly<{
    relationType: string;
    edgeClass: GenesisT8GraphEdgeClass;
    direction: GenesisT8GraphDirection;
    endpointNodeId: string;
    sourceRelationshipId: string;
  }>;
}>;

export type CieR5CanonicalRelationshipState = Readonly<{
  id: string;
  relationType: string;
  edgeClass: GenesisT8GraphEdgeClass;
  direction: GenesisT8GraphDirection;
  fromNodeId: string;
  toNodeId: string;
  fromEntityKind: string;
  fromLabel: string;
  fromCanonicalDomain: string | null;
  toEntityKind: string;
  toLabel: string;
  toCanonicalDomain: string | null;
  state: CieR5RouteState;
}>;

export type CieR5PathProvenance = Readonly<{
  routeId: string;
  pathState: CieR5RouteState;
  nodeIds: readonly string[];
  edgeIds: readonly string[];
  canonicalRelations: readonly Readonly<{
    edgeId: string;
    sourceRelationshipId: string;
    relationType: string;
    edgeClass: GenesisT8GraphEdgeClass;
    direction: GenesisT8GraphDirection;
  }>[];
}>;

export type CieR5RouteAuthorityResult = Readonly<{
  authorityMode: "AUTHORITATIVE";
  evidenceSemanticsVersion: typeof GENESIS_T8_CIE_R5_ROUTE_EVIDENCE_SEMANTICS;
  strategy: CieR5ChannelStrategy;
  graphAssessment: ReturnType<typeof evaluateCommercialGraph>;
  selectedRouteIds: readonly string[];
  routeStates: readonly AuthoritativeRoute[];
  relationshipStates: readonly CieR5CanonicalRelationshipState[];
  pathProvenance: readonly CieR5PathProvenance[];
}>;

const SOURCE_NODE_ID = "cie:target-company";
const TARGET_NODE_ID = "cie:engagement-objective";
const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const lower = (value: unknown): string => text(value).toLowerCase();
const digits = (value: unknown): string => text(value).replace(/\D+/g, "");
const canonicalKey = (value: unknown): string => lower(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100);

function normalizedLinkedIn(value: string): string {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== "linkedin.com" && !host.endsWith(".linkedin.com")) return "";
    return `https://www.linkedin.com${url.pathname.replace(/\/$/, "")}`.toLowerCase();
  } catch { return ""; }
}

function evidenceRows(route: RouteTruth): readonly RouteEvidence[] {
  return Array.isArray(route.evidence) ? route.evidence.filter((item): item is RouteEvidence => !!item && typeof item === "object") : [];
}

function qualifyingEvidence(route: RouteTruth): readonly RouteEvidence[] {
  return evidenceRows(route).filter((item) => item.verified === true && item.excerptMatched === true && text(item.sourceUrl));
}

function evidenceBody(item: RouteEvidence): string {
  return `${lower(item.evidenceType)} ${lower(item.claim)} ${lower(item.excerpt)} ${lower(item.sourceUrl)}`;
}

function channelValueSupported(route: RouteTruth, channelType: string, channelValue: string): boolean {
  const candidates = qualifyingEvidence(route);
  if (!candidates.length) return false;
  if (["DIRECT_EMAIL", "DEPARTMENT_EMAIL", "GENERAL_EMAIL"].includes(channelType)) {
    const expected = channelValue.toLowerCase();
    return candidates.some((item) => evidenceBody(item).includes(expected));
  }
  if (channelType === "LINKEDIN") {
    const expected = normalizedLinkedIn(channelValue);
    return !!expected && candidates.some((item) => normalizedLinkedIn(text(item.sourceUrl)) === expected || evidenceBody(item).includes(expected));
  }
  if (channelType === "SWITCHBOARD") {
    const expected = digits(channelValue);
    return expected.length >= 7 && candidates.some((item) => digits(`${text(item.claim)} ${text(item.excerpt)}`).includes(expected));
  }
  if (channelType === "INTRODUCTION") {
    const value = channelValue.toLowerCase();
    const person = lower(route.contactName);
    return candidates.some((item) => {
      const body = evidenceBody(item);
      return (value.length >= 3 && body.includes(value)) || (person.length >= 3 && body.includes(person));
    });
  }
  return false;
}

function namedPersonSupported(route: RouteTruth): boolean {
  const person = lower(route.contactName);
  if (person.length < 3) return false;
  const role = lower(route.contactRole) || lower(route.targetRole) || lower(route.entryRole);
  return qualifyingEvidence(route).some((item) => {
    const body = evidenceBody(item);
    return body.includes(person) && (role.length < 3 || body.includes(role));
  });
}

function organisationalUnitSupported(route: RouteTruth): boolean {
  const unit = lower(route.department) || lower(route.entryRole) || lower(route.targetRole);
  if (unit.length < 3) return false;
  return qualifyingEvidence(route).some((item) => evidenceBody(item).includes(unit));
}

function introductionSupported(route: RouteTruth): boolean {
  const intermediary = lower(route.channelValue) || lower(route.contactName) || lower(route.label);
  if (intermediary.length < 3) return false;
  return qualifyingEvidence(route).some((item) => {
    const body = evidenceBody(item);
    return body.includes(intermediary) && /\b(introduc|introduction|intro|refer|referral|warm route|warm path)\b/.test(body);
  });
}

function relationMeta(relationType: string): Readonly<{ relationType: string; edgeClass: GenesisT8GraphEdgeClass; direction: GenesisT8GraphDirection }> {
  const definition = getRelationshipDefinition(relationType);
  if (!definition) throw new Error(`GENESIS_T8_CIE_R5_VIOLATION:UNKNOWN_RELATION:${relationType}`);
  return Object.freeze({ relationType, edgeClass: definition.edgeClass, direction: definition.direction });
}

function structuralRelationshipForRoute(route: RouteTruth, routeId: string, channelType: string, channelValue: string | null): AuthoritativeRoute["structuralRelationship"] & { state: CieR5RouteState } {
  const contactName = text(route.contactName);
  const department = text(route.department);
  const entryRole = text(route.entryRole);
  const targetRole = text(route.targetRole);
  if (channelType === "INTRODUCTION") {
    const label = channelValue || text(route.label) || contactName || routeId;
    const endpointNodeId = `cie:introducer:${canonicalKey(label) || routeId}`;
    return Object.freeze({ ...relationMeta("introduced_by"), endpointNodeId, sourceRelationshipId: `route:${routeId}:introduction`, state: introductionSupported(route) ? "OPEN" : "UNRESOLVED" });
  }
  if (contactName) {
    const endpointNodeId = `cie:person:${canonicalKey(contactName) || routeId}`;
    return Object.freeze({ ...relationMeta("employs"), endpointNodeId, sourceRelationshipId: `route:${routeId}:employs`, state: namedPersonSupported(route) ? "OPEN" : "UNRESOLVED" });
  }
  if (channelType === "DEPARTMENT_EMAIL" || department || entryRole || targetRole) {
    const label = department || entryRole || targetRole || "organisational-unit";
    const endpointNodeId = `cie:organisational_unit:${canonicalKey(label) || routeId}`;
    return Object.freeze({ ...relationMeta("parent_of"), endpointNodeId, sourceRelationshipId: `route:${routeId}:unit`, state: organisationalUnitSupported(route) ? "OPEN" : "UNRESOLVED" });
  }
  const label = channelValue || channelType || routeId;
  const endpointNodeId = `cie:access:${canonicalKey(`${channelType}-${label}`) || routeId}`;
  return Object.freeze({ ...relationMeta("has_access_point"), endpointNodeId, sourceRelationshipId: `route:${routeId}:access`, state: channelValue && channelValueSupported(route, channelType, channelValue) ? "OPEN" : "UNRESOLVED" });
}

export function evaluateRawRouteState(value: unknown): AuthoritativeRoute | null {
  if (!value || typeof value !== "object") return null;
  const route = value as RouteTruth;
  const id = text(route.id);
  if (!id) return null;
  const routeSemanticsVersion = text(route.routeSemanticsVersion);
  const channelType = text(route.channelType) || "UNKNOWN";
  const executionChannel = CHANNEL_COMPATIBILITY[channelType] ?? null;
  const channelValue = text(route.channelValue) || null;
  const routeType = text(route.routeType) || "OPERATIONAL";
  const label = text(route.label) || null;
  const entryRole = text(route.entryRole) || null;
  const department = text(route.department) || null;
  const contactName = text(route.contactName) || null;
  const contactRole = text(route.contactRole) || null;
  const targetRole = text(route.targetRole) || null;
  const validSemantics = ["MR-T8-FB4-RAW", "MR-T8-FB4-MIGRATED-RAW", "MR-T8-FB5-RAW"].includes(routeSemanticsVersion);
  const channelState: CieR5RouteState = validSemantics && channelType !== "UNKNOWN" && executionChannel && channelValue && channelValueSupported(route, channelType, channelValue) ? "OPEN" : "UNRESOLVED";
  const structural = structuralRelationshipForRoute(route, id, channelType, channelValue);
  const edgeState: CieR5RouteState = structural.state === "BLOCKED" ? "BLOCKED" : channelState === "OPEN" && structural.state === "OPEN" ? "OPEN" : "UNRESOLVED";
  return Object.freeze({
    id, routeType, label, entryRole, department, contactName, contactRole, targetRole, channelType, channelValue, executionChannel,
    channelState, structuralState: structural.state, edgeState,
    evidenceSupport: channelState === "OPEN" ? "CHANNEL_VALUE_SUPPORTED" : channelValue ? "CHANNEL_VALUE_UNSUPPORTED" : "CHANNEL_UNRESOLVED",
    structuralRelationship: Object.freeze({ relationType: structural.relationType, edgeClass: structural.edgeClass, direction: structural.direction, endpointNodeId: structural.endpointNodeId, sourceRelationshipId: structural.sourceRelationshipId }),
  });
}

function sourceRoutes(sourceSnapshot: Record<string, unknown>): readonly AuthoritativeRoute[] {
  const opportunity = sourceSnapshot.opportunity as Record<string, unknown> | undefined;
  const raw = Array.isArray(opportunity?.commercial_routes) ? opportunity.commercial_routes : [];
  const routes = raw.map(evaluateRawRouteState).filter((route): route is AuthoritativeRoute => route !== null);
  const ids = new Set<string>();
  for (const route of routes) { if (ids.has(route.id)) throw new Error("GENESIS_T8_CIE_R5_VIOLATION:DUPLICATE_ROUTE_ID"); ids.add(route.id); }
  return Object.freeze([...routes].sort((a, b) => a.id.localeCompare(b.id)));
}

function relationshipNodeId(kind: string, label: string, canonicalDomain: string, provided: string): string {
  if (kind === "TARGET_COMPANY") return SOURCE_NODE_ID;
  if (provided) return provided;
  if (kind === "EXTERNAL_ORGANISATION" && canonicalDomain) return `cie:org:${canonicalKey(canonicalDomain)}`;
  return `cie:${canonicalKey(kind) || "entity"}:${canonicalKey(label) || "unknown"}`;
}

function sourceCanonicalRelationships(sourceSnapshot: Record<string, unknown>): readonly CieR5CanonicalRelationshipState[] {
  const opportunity = sourceSnapshot.opportunity as Record<string, unknown> | undefined;
  const raw = Array.isArray(opportunity?.canonical_relationships) ? opportunity.canonical_relationships : [];
  const out: CieR5CanonicalRelationshipState[] = [];
  const ids = new Set<string>();
  for (const value of raw) {
    if (!value || typeof value !== "object") continue;
    const rel = value as CanonicalRelationshipTruth;
    const id = text(rel.id); const relationType = text(rel.relationType); const edgeClass = text(rel.edgeClass) as GenesisT8GraphEdgeClass; const direction = text(rel.direction) as GenesisT8GraphDirection;
    if (!id || ids.has(id)) continue;
    const definition = assertRelationshipDefinition(relationType, edgeClass, direction);
    const fromEntityKind = text(rel.fromEntityKind); const toEntityKind = text(rel.toEntityKind);
    const fromLabel = text(rel.fromLabel); const toLabel = text(rel.toLabel);
    const fromNodeId = relationshipNodeId(fromEntityKind, fromLabel, text(rel.fromCanonicalDomain), text(rel.fromNodeId));
    const toNodeId = relationshipNodeId(toEntityKind, toLabel, text(rel.toCanonicalDomain), text(rel.toNodeId));
    const rawState = text(rel.authorityState) || text(rel.state);
    const state: CieR5RouteState = rawState === "OPEN" ? "OPEN" : rawState === "BLOCKED" ? "BLOCKED" : "UNRESOLVED";
    if (fromNodeId === toNodeId) continue;
    ids.add(id);
    out.push(Object.freeze({ id, relationType: definition.relationType, edgeClass: definition.edgeClass, direction: definition.direction, fromNodeId, toNodeId, fromEntityKind, fromLabel, fromCanonicalDomain: text(rel.fromCanonicalDomain) || null, toEntityKind, toLabel, toCanonicalDomain: text(rel.toCanonicalDomain) || null, state }));
  }
  return Object.freeze(out.sort((a, b) => a.id.localeCompare(b.id)));
}


function canonicalRelationshipForRoute(route: AuthoritativeRoute, relationships: readonly CieR5CanonicalRelationshipState[]): Readonly<{ relationship: CieR5CanonicalRelationshipState; endpointNodeId: string }> | null {
  const expectedKind = route.channelType === "INTRODUCTION"
    ? "EXTERNAL_ORGANISATION"
    : (!route.contactName && (route.department || route.entryRole || route.targetRole) ? "ORGANISATIONAL_UNIT" : null);
  if (!expectedKind) return null;
  const rawNeedles = route.channelType === "INTRODUCTION"
    ? [route.channelValue, route.contactName, route.label]
    : [route.department, route.entryRole, route.targetRole, route.label];
  const needles = rawNeedles.map((value) => canonicalKey(value)).filter((value) => value.length >= 3);
  if (!needles.length) return null;
  const candidates = relationships.flatMap((relationship) => {
    let endpointNodeId: string | null = null;
    let endpointHaystack = "";
    let endpointKind = "";
    if (relationship.fromNodeId === SOURCE_NODE_ID) {
      endpointNodeId = relationship.toNodeId; endpointKind = relationship.toEntityKind;
      endpointHaystack = canonicalKey(`${relationship.toLabel} ${relationship.toCanonicalDomain ?? ""}`);
    } else if (relationship.direction === "UNDIRECTED" && relationship.toNodeId === SOURCE_NODE_ID) {
      endpointNodeId = relationship.fromNodeId; endpointKind = relationship.fromEntityKind;
      endpointHaystack = canonicalKey(`${relationship.fromLabel} ${relationship.fromCanonicalDomain ?? ""}`);
    }
    if (!endpointNodeId || endpointKind !== expectedKind || !needles.some((needle) => endpointHaystack.includes(needle) || needle.includes(endpointHaystack))) return [];
    return [{ relationship, endpointNodeId }];
  }).sort((a, b) => a.relationship.id.localeCompare(b.relationship.id));
  return candidates[0] ?? null;
}

function applyCanonicalRelationshipStructure(routes: readonly AuthoritativeRoute[], relationships: readonly CieR5CanonicalRelationshipState[]): readonly AuthoritativeRoute[] {
  return Object.freeze(routes.map((route) => {
    const match = canonicalRelationshipForRoute(route, relationships);
    if (!match) return route;
    const structuralRelationship = Object.freeze({
      relationType: match.relationship.relationType,
      edgeClass: match.relationship.edgeClass,
      direction: match.relationship.direction,
      endpointNodeId: match.endpointNodeId,
      sourceRelationshipId: match.relationship.id,
    });
    const structuralState = match.relationship.state;
    const edgeState: CieR5RouteState = route.channelState === "BLOCKED" || structuralState === "BLOCKED" ? "BLOCKED" : route.channelState === "OPEN" && structuralState === "OPEN" ? "OPEN" : "UNRESOLVED";
    return Object.freeze({ ...route, structuralRelationship, structuralState, edgeState });
  }));
}

function graphForRoutes(realityId: string, routes: readonly AuthoritativeRoute[], relationships: readonly CieR5CanonicalRelationshipState[]): GenesisT8CommercialDecisionGraph {
  const edges: GenesisT8CommercialPathEdge[] = [];
  const nodes = new Set<string>([SOURCE_NODE_ID, TARGET_NODE_ID]);
  for (const relationship of relationships) {
    nodes.add(relationship.fromNodeId); nodes.add(relationship.toNodeId);
    const metadata = Object.freeze({ relationType: relationship.relationType, edgeClass: relationship.edgeClass, direction: relationship.direction });
    edges.push(Object.freeze({ edgeId: `relationship:${relationship.id}:forward`, fromNodeId: relationship.fromNodeId, toNodeId: relationship.toNodeId, sourceRelationshipId: relationship.id, canonicalRelationship: metadata, state: relationship.state, stabilityMargin: null }));
    if (relationship.direction === "UNDIRECTED") {
      edges.push(Object.freeze({ edgeId: `relationship:${relationship.id}:reverse`, fromNodeId: relationship.toNodeId, toNodeId: relationship.fromNodeId, sourceRelationshipId: relationship.id, canonicalRelationship: metadata, state: relationship.state, stabilityMargin: null }));
    }
  }
  for (const route of routes) {
    const endpointNodeId = route.structuralRelationship.endpointNodeId;
    nodes.add(endpointNodeId);
    const usesPersistedRelationship = !route.structuralRelationship.sourceRelationshipId.startsWith("route:");
    if (!usesPersistedRelationship) {
      edges.push(Object.freeze({
        edgeId: `route:${route.id}:structure`, fromNodeId: SOURCE_NODE_ID, toNodeId: endpointNodeId, sourceRelationshipId: route.structuralRelationship.sourceRelationshipId,
        canonicalRelationship: Object.freeze({ relationType: route.structuralRelationship.relationType, edgeClass: route.structuralRelationship.edgeClass, direction: route.structuralRelationship.direction }),
        state: route.structuralState, stabilityMargin: null,
      }));
    }
    const reachable = relationMeta("reachable_via");
    edges.push(Object.freeze({
      edgeId: `route:${route.id}:reach`, fromNodeId: endpointNodeId, toNodeId: TARGET_NODE_ID, sourceRelationshipId: `route:${route.id}:reachable-via`,
      canonicalRelationship: reachable, state: route.channelState, stabilityMargin: null,
    }));
  }
  return Object.freeze({
    realityId,
    nodes: Object.freeze([...nodes].sort((a, b) => a.localeCompare(b)).map((nodeId) => Object.freeze({ nodeId, referencedTokenIds: Object.freeze([]) }))),
    edges: Object.freeze(edges.sort((a, b) => a.edgeId.localeCompare(b.edgeId))),
  });
}

function routeIdFromPathEdgeIds(edgeIds: readonly string[]): string | null {
  const edge = [...edgeIds].reverse().find((id) => id.startsWith("route:") && id.endsWith(":reach"));
  return edge ? edge.slice("route:".length, -":reach".length) : null;
}

function pathProvenance(graph: GenesisT8CommercialDecisionGraph, assessment: ReturnType<typeof evaluateCommercialGraph>): readonly CieR5PathProvenance[] {
  const byEdge = new Map(graph.edges.map((edge) => [edge.edgeId, edge] as const));
  return Object.freeze(assessment.paretoPaths.map((path) => {
    const routeId = routeIdFromPathEdgeIds(path.edgeIds);
    if (!routeId) return null;
    const canonicalRelations = path.edgeIds.map((edgeId) => byEdge.get(edgeId)).filter((edge): edge is GenesisT8CommercialPathEdge => !!edge).map((edge) => {
      if (!edge.canonicalRelationship) throw new Error("GENESIS_T8_CIE_R5_VIOLATION:NON_CANONICAL_LIVE_EDGE");
      return Object.freeze({ edgeId: edge.edgeId, sourceRelationshipId: edge.sourceRelationshipId, ...edge.canonicalRelationship });
    });
    return Object.freeze({ routeId, pathState: path.pathState, nodeIds: path.nodeIds, edgeIds: path.edgeIds, canonicalRelations: Object.freeze(canonicalRelations) });
  }).filter((value): value is CieR5PathProvenance => value !== null).sort((a, b) => `${a.routeId}:${a.edgeIds.join("/")}`.localeCompare(`${b.routeId}:${b.edgeIds.join("/")}`)));
}

function commercialReasoningText(commercialReasoning: Record<string, unknown>, key: string, fallback: string): string {
  const value = commercialReasoning[key]; return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function routeDecision(route: AuthoritativeRoute, reason: string, commitment: string): CieR5RouteDecision {
  if (!route.executionChannel || !route.channelValue || route.edgeState !== "OPEN") throw new Error("GENESIS_T8_CIE_R5_VIOLATION:NON_OPEN_SELECTION");
  return Object.freeze({ routeId: route.id, executionChannel: route.executionChannel, selectionReason: reason, commercialFriction: "MEDIUM", expectedCommitment: commitment });
}

export function evaluateCieR5RouteAuthority(input: { realityId: string; commercialReasoning: Record<string, unknown>; sourceSnapshot: Record<string, unknown> }): CieR5RouteAuthorityResult {
  if (!input.realityId.trim()) throw new Error("GENESIS_T8_CIE_R5_VIOLATION:REALITY_ID");
  const routes = sourceRoutes(input.sourceSnapshot);
  if (!routes.length) throw new Error("GENESIS_T8_CIE_R5_VIOLATION:NO_ROUTES");
  const relationships = sourceCanonicalRelationships(input.sourceSnapshot);
  const effectiveRoutes = applyCanonicalRelationshipStructure(routes, relationships);
  const graph = graphForRoutes(input.realityId, effectiveRoutes, relationships);
  for (const edge of graph.edges) if (!edge.canonicalRelationship) throw new Error("GENESIS_T8_CIE_R5_VIOLATION:NON_CANONICAL_LIVE_EDGE");
  const assessment = evaluateCommercialGraph(graph, SOURCE_NODE_ID, TARGET_NODE_ID, { maxSimplePaths: 128, maxPathDepth: 8 });
  const openPathRouteIds = assessment.openParetoPaths.map((path) => routeIdFromPathEdgeIds(path.edgeIds)).filter((id): id is string => !!id);
  const selected = [...new Set(openPathRouteIds)].sort((a, b) => a.localeCompare(b));
  if (!selected.length) throw new Error(assessment.structuralReachable ? "GENESIS_T8_CIE_R5_ROUTE_UNRESOLVED" : "GENESIS_T8_CIE_R5_NO_STRUCTURAL_ROUTE");
  const byId = new Map(effectiveRoutes.map((route) => [route.id, route] as const));
  const chosen = selected.slice(0, 3).map((id) => byId.get(id)!).filter(Boolean);
  const commitment = commercialReasoningText(input.commercialReasoning, "smallestReasonableCommitment", "Confirm relevance and the correct owner for a next conversation.");
  const whyNow = commercialReasoningText(input.commercialReasoning, "whyNow", "No separate timing trigger is verified; use the established commercial relevance without manufacturing urgency.");
  const tie = selected.length > 1;
  const primaryReason = tie ? "This route terminates an evidence-qualified canonical OPEN relationship path on the authoritative Pareto frontier. Other frontier paths are nondominated; canonical route ID order is used only for reproducible execution." : "This route terminates the unique evidence-qualified canonical OPEN path on the current Pareto frontier.";
  const secondaryReason = "This is another evidence-qualified canonical OPEN nondominated path retained as an independent execution alternative.";
  const strategy: CieR5ChannelStrategy = Object.freeze({
    schemaVersion: "g5-channel-strategy/v1", promptVersion: "cie-r5-route-authority/v3",
    primary: routeDecision(chosen[0], primaryReason, commitment), secondary: chosen[1] ? routeDecision(chosen[1], secondaryReason, commitment) : null, fallback: chosen[2] ? routeDecision(chosen[2], secondaryReason, commitment) : null,
    sequenceRationale: tie ? "Execute the canonical member of the nondominated evidence-qualified OPEN relationship-path frontier first. Remaining frontier members are alternatives; sequence is operational, not a weighted commercial ranking." : "Use the uniquely evidence-qualified OPEN canonical relationship path first.",
    primaryWhyNow: whyNow,
    alternativesNotFirst: selected.slice(3).map((routeId) => ({ routeId, reason: "Also terminates an authoritative OPEN Pareto path but is outside the three-slot execution compatibility envelope." })),
    channelConfidence: 100,
    limitations: Object.freeze([`CIE-R5 graph robustness: ${assessment.robustnessClass}.`, `Route/relationship evidence semantics: ${GENESIS_T8_CIE_R5_ROUTE_EVIDENCE_SEMANTICS}.`, ...(tie ? ["Multiple nondominated OPEN paths exist; no scalar score was used to claim one is commercially superior."] : [])]),
  });
  return Object.freeze({ authorityMode: GENESIS_T8_CIE_R5_AUTHORITY_MODE, evidenceSemanticsVersion: GENESIS_T8_CIE_R5_ROUTE_EVIDENCE_SEMANTICS, strategy, graphAssessment: assessment, selectedRouteIds: Object.freeze(selected), routeStates: effectiveRoutes, relationshipStates: relationships, pathProvenance: pathProvenance(graph, assessment) });
}

export const GENESIS_T8_CIE_R5_ROUTE_LAWS = Object.freeze([
  "CIE_R5_IS_THE_SOLE_LIVE_ROUTE_AUTHORITY",
  "EVERY_LIVE_DECISION_EDGE_IS_BOUND_TO_THE_CANONICAL_GENESIS_RELATIONSHIP_ONTOLOGY",
  "AI_MAY_PROPOSE_EVIDENCE_BACKED_RELATIONSHIP_SEMANTICS_BUT_MAY_NOT_SCORE_WEIGHT_RANK_OR_LABEL_RELATIONSHIP_STRENGTH",
  "LEGACY_IS_VIABLE_IS_PRIMARY_ROUTE_QUALITY_AND_CONFIDENCE_ARE_FORBIDDEN_AUTHORITY_INPUTS",
  "AN_EXECUTABLE_ROUTE_REQUIRES_BOTH_AN_EVIDENCE_QUALIFIED_STRUCTURAL_RELATIONSHIP_AND_A_SUPPORTED_CHANNEL_VALUE",
  "DIRECTED_BUSINESS_RELATIONSHIPS_ARE_NEVER_SILENTLY_REVERSED",
  "UNDIRECTED_RELATIONSHIPS_MAY_BE_TRAVERSED_BOTH_WAYS_WITH_ONE_CANONICAL_SOURCE_ASSERTION",
  "THE_PARETO_FRONTIER_IS_COMPUTED_OVER_MULTI_HOP_CANONICAL_RELATIONSHIP_PATHS",
  "MISSING_OPEN_PATH_FAILS_CLOSED_AND_NEVER_FALLS_BACK_TO_AI_OR_LEGACY_SCORING",
] as const);

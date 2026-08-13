import type { GenesisT8GraphDirection, GenesisT8GraphEdgeClass } from "./commercial-graph-9d";

export type GenesisT8RelationTopology = "CYCLES_ALLOWED" | "ACYCLIC" | "DAG_WITHIN_SCOPE";
export type GenesisT8RelationshipDefinition = Readonly<{
  relationType: string;
  edgeClass: GenesisT8GraphEdgeClass;
  direction: GenesisT8GraphDirection;
  topology: GenesisT8RelationTopology;
  meaning: string;
}>;

const r = <T extends GenesisT8RelationshipDefinition>(value: T): T => Object.freeze(value);

export const GENESIS_T8_RELATIONSHIP_CATALOGUE = Object.freeze([
  r({ relationType: "supports", edgeClass: "INFLUENCE", direction: "DIRECTED", topology: "CYCLES_ALLOWED", meaning: "Source fact provides non-truth structural support to target concept." }),
  r({ relationType: "depends_on", edgeClass: "DEPENDENCY", direction: "DIRECTED", topology: "CYCLES_ALLOWED", meaning: "Source state depends upon target state or capability." }),
  r({ relationType: "contradicts", edgeClass: "CONTRADICTION", direction: "UNDIRECTED", topology: "CYCLES_ALLOWED", meaning: "The two propositions cannot simultaneously describe the same scoped reality without contradiction." }),
  r({ relationType: "equivalent_to", edgeClass: "EQUIVALENCE", direction: "UNDIRECTED", topology: "CYCLES_ALLOWED", meaning: "AI-canonicalised concepts are semantically equivalent for the stated scope." }),
  r({ relationType: "part_of", edgeClass: "COMPOSITION", direction: "DIRECTED", topology: "ACYCLIC", meaning: "Source entity, capability or state is structurally part of target." }),
  r({ relationType: "parent_of", edgeClass: "COMPOSITION", direction: "DIRECTED", topology: "ACYCLIC", meaning: "Source organisational entity is a direct parent of target." }),
  r({ relationType: "subsidiary_of", edgeClass: "COMPOSITION", direction: "DIRECTED", topology: "ACYCLIC", meaning: "Source organisational entity is controlled as a subsidiary of target." }),
  r({ relationType: "partners_with", edgeClass: "ASSOCIATION", direction: "UNDIRECTED", topology: "CYCLES_ALLOWED", meaning: "The two entities have an evidenced partnership relationship." }),
  r({ relationType: "supplies", edgeClass: "ASSOCIATION", direction: "DIRECTED", topology: "CYCLES_ALLOWED", meaning: "Source entity supplies target entity." }),
  r({ relationType: "customer_of", edgeClass: "ASSOCIATION", direction: "DIRECTED", topology: "CYCLES_ALLOWED", meaning: "Source entity is an evidenced customer of target entity." }),
  r({ relationType: "uses_technology_from", edgeClass: "ASSOCIATION", direction: "DIRECTED", topology: "CYCLES_ALLOWED", meaning: "Source entity uses technology supplied by target entity." }),
  r({ relationType: "employs", edgeClass: "ASSOCIATION", direction: "DIRECTED", topology: "CYCLES_ALLOWED", meaning: "Source organisation or organisational unit currently employs or formally contains the target person for the stated scope." }),
  r({ relationType: "has_access_point", edgeClass: "COMPOSITION", direction: "DIRECTED", topology: "ACYCLIC", meaning: "Source organisation exposes the target verified public commercial access point as part of its current operating structure." }),
  r({ relationType: "reachable_via", edgeClass: "ASSOCIATION", direction: "DIRECTED", topology: "CYCLES_ALLOWED", meaning: "Source commercial actor or access point provides an evidence-qualified execution path to the target engagement objective." }),
  r({ relationType: "introduced_by", edgeClass: "ASSOCIATION", direction: "DIRECTED", topology: "CYCLES_ALLOWED", meaning: "Source organisation is evidence-qualified as reachable through the target introducer or intermediary." }),
  r({ relationType: "supersedes", edgeClass: "TEMPORAL", direction: "DIRECTED", topology: "ACYCLIC", meaning: "Source knowledge object replaces target as the later authoritative representation." }),
] as const);

export type GenesisT8CanonicalRelationType = (typeof GENESIS_T8_RELATIONSHIP_CATALOGUE)[number]["relationType"];

export function getRelationshipDefinition(relationType: string): GenesisT8RelationshipDefinition | undefined {
  return GENESIS_T8_RELATIONSHIP_CATALOGUE.find((definition) => definition.relationType === relationType);
}

export function assertRelationshipDefinition(relationType: string, edgeClass: GenesisT8GraphEdgeClass, direction: GenesisT8GraphDirection): GenesisT8RelationshipDefinition {
  const definition = getRelationshipDefinition(relationType);
  if (!definition) throw new Error(`GENESIS_T8_RELATION_VIOLATION:UNKNOWN_RELATION:${relationType}`);
  if (definition.edgeClass !== edgeClass) throw new Error("GENESIS_T8_RELATION_VIOLATION:EDGE_CLASS_MISMATCH");
  if (definition.direction !== direction) throw new Error("GENESIS_T8_RELATION_VIOLATION:DIRECTION_MISMATCH");
  return definition;
}

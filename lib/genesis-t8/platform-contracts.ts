/** Persistence-neutral scale/time contracts introduced by CE-R1 Build 7. */
import type { GenesisT8CommercialToken } from "./token-theory";
import type { GenesisT8DimensionProjection, GenesisT8GraphEdge, GenesisT8GraphTemporalScope } from "./commercial-graph-9d";

export type GenesisT8EntityIdentity = Readonly<{
  genesisEntityId: string;
  entityType: "ORGANISATION" | "PERSON" | "LOCATION" | "OTHER";
  canonicalLabel: string;
  resolvedBy: "AI" | "HUMAN" | "DETERMINISTIC_IMPORT";
  aliasIds: readonly string[];
  supersededByEntityId?: string;
}>;

export function assertEntityIdentityInvariant(entity: GenesisT8EntityIdentity): void {
  if (!/^gen:[a-z0-9][a-z0-9:_-]{5,}$/i.test(entity.genesisEntityId)) throw new Error("GENESIS_T8_ENTITY_VIOLATION:GLOBAL_ID");
  if (!entity.canonicalLabel.trim()) throw new Error("GENESIS_T8_ENTITY_VIOLATION:LABEL");
  if (new Set(entity.aliasIds).size !== entity.aliasIds.length || entity.aliasIds.some((id)=>!id.trim())) throw new Error("GENESIS_T8_ENTITY_VIOLATION:ALIASES");
  if (entity.supersededByEntityId === entity.genesisEntityId) throw new Error("GENESIS_T8_ENTITY_VIOLATION:SELF_SUPERSESSION");
}

export interface GenesisT8GraphAccessPort {
  getTokenById(tokenId: string): Promise<GenesisT8CommercialToken | null>;
  findTokenByCanonicalIdentity(identityKey: string): Promise<GenesisT8CommercialToken | null>;
  getTokensForEntity(entityId: string, scope: GenesisT8GraphTemporalScope): Promise<readonly GenesisT8CommercialToken[]>;
  getOutgoingEdges(tokenId: string, scope: GenesisT8GraphTemporalScope): Promise<readonly GenesisT8GraphEdge[]>;
  getIncomingEdges(tokenId: string, scope: GenesisT8GraphTemporalScope): Promise<readonly GenesisT8GraphEdge[]>;
  getProjections(tokenId: string): Promise<readonly GenesisT8DimensionProjection[]>;
}

export type GenesisT8EvidenceLink = Readonly<{ knowledgeObjectId: string; evidenceId: string; role: "SUPPORTING" | "CONTRADICTING" | "CONTEXT" }>;
export type GenesisT8RefreshWork = Readonly<{ tokenId: string; lastQualifiedAt?: string; nextReviewAt: string; refreshReason: string; policyVersion: string }>;

export const GENESIS_T8_PHYSICAL_MODEL_LAWS = Object.freeze([
  "LOGICAL_GRAPH_DOES_NOT_PRESCRIBE_DATABASE_TECHNOLOGY",
  "HOT_KNOWLEDGE_OBJECTS_NEED_NOT_EMBED_UNBOUNDED_EVIDENCE_ARRAYS_IN_PHYSICAL_STORAGE",
  "CURRENT_AS_OF_AND_HISTORICAL_VIEWS_ARE_FIRST_CLASS",
  "REFRESH_SCHEDULING_IS_OPERATIONAL_METADATA_NOT_TOKEN_IDENTITY",
  "GLOBAL_GENESIS_ENTITY_IDENTITY_IS_APPLICATION_AND_PROVIDER_INDEPENDENT",
] as const);

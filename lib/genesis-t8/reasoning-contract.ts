/** Genesis T8 reasoning input contract — mathematical purity boundary. */
import { getGenesisT8EngineContract } from "./constitution";
import type { GenesisT8GraphTemporalScope } from "./commercial-graph-9d";

export const GENESIS_T8_REASONING_INPUT_CONTRACT_VERSION = "1.0.0" as const;
export type GenesisT8ReasoningInput = Readonly<{
  engineId: string;
  engineVersion: string;
  graphSnapshotId: string;
  truthAuthorityId: string;
  ontologyVersion: string;
  temporalScope: GenesisT8GraphTemporalScope;
  upstreamReasoning: readonly Readonly<{ producerEngineId: string; producerEngineVersion: string; reasoningSnapshotId: string }>[];
}>;

export function assertReasoningInputInvariant(input: GenesisT8ReasoningInput): void {
  const contract = getGenesisT8EngineContract(input.engineId);
  if (!contract) throw new Error(`GENESIS_T8_REASONING_VIOLATION:UNREGISTERED_ENGINE:${input.engineId}`);
  if (!input.engineVersion.trim() || !input.graphSnapshotId.trim() || !input.truthAuthorityId.trim() || !input.ontologyVersion.trim()) throw new Error("GENESIS_T8_REASONING_VIOLATION:CANONICAL_INPUT_REQUIRED");
  const producers = new Set<string>();
  for (const upstream of input.upstreamReasoning) {
    if (!contract.consumesDerivedReasoningFrom.includes(upstream.producerEngineId)) throw new Error(`GENESIS_T8_REASONING_VIOLATION:UNAUTHORISED_UPSTREAM:${upstream.producerEngineId}`);
    if (producers.has(upstream.producerEngineId)) throw new Error("GENESIS_T8_REASONING_VIOLATION:DUPLICATE_UPSTREAM_ENGINE");
    producers.add(upstream.producerEngineId);
    if (!upstream.producerEngineVersion.trim() || !upstream.reasoningSnapshotId.trim()) throw new Error("GENESIS_T8_REASONING_VIOLATION:UPSTREAM_IDENTITY");
  }
}

export type GenesisT8ReasoningCacheIdentity = Readonly<{
  engineId: string;
  engineVersion: string;
  algorithmVersion: string;
  graphSnapshotId: string;
  truthAuthorityId: string;
  ontologySemanticFingerprint: string;
  temporalScopeKey: string;
  upstreamReasoningSnapshotIds: readonly string[];
}>;

export function reasoningCacheIdentityKey(identity: GenesisT8ReasoningCacheIdentity): string {
  return [identity.engineId,identity.engineVersion,identity.algorithmVersion,identity.graphSnapshotId,identity.truthAuthorityId,identity.ontologySemanticFingerprint,identity.temporalScopeKey,[...identity.upstreamReasoningSnapshotIds].sort().join(",")].join("|");
}

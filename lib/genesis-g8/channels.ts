/**
 * Genesis G8 has two peer intelligence channels.
 *
 * KNOWLEDGE_INTELLIGENCE retrieves and refreshes previously accumulated,
 * Truth-Index-scored intelligence.
 * DISCOVERY_INTELLIGENCE preserves MarketRoute's existing live discovery path
 * for new, sparse, emerging, or low-confidence markets.
 *
 * Release 1 defines this contract only. It deliberately does not route any
 * production workload yet.
 */
export const GENESIS_G8_INTELLIGENCE_CHANNELS = [
  "KNOWLEDGE_INTELLIGENCE",
  "DISCOVERY_INTELLIGENCE",
] as const;

export type GenesisG8IntelligenceChannel =
  (typeof GENESIS_G8_INTELLIGENCE_CHANNELS)[number];

export type GenesisG8ChannelStrategy =
  | "KNOWLEDGE_FIRST_WITH_DISCOVERY_FALLBACK"
  | "DISCOVERY_ONLY"
  | "KNOWLEDGE_ONLY";

/**
 * The intended production default once routing is wired in a later release.
 * This value is descriptive in G8.1 R1 and has no live pipeline effect.
 */
export const GENESIS_G8_DEFAULT_CHANNEL_STRATEGY: GenesisG8ChannelStrategy =
  "KNOWLEDGE_FIRST_WITH_DISCOVERY_FALLBACK";

export interface GenesisG8ChannelProvenance {
  channel: GenesisG8IntelligenceChannel;
  discoveredAt?: string;
  retrievedAt?: string;
  /** Optional source entity/reference for future merge-layer attribution. */
  sourceRef?: string;
}

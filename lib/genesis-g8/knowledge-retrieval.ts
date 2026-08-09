import "server-only";
import type { TruthEntityType } from "./truth";
import { evaluateGenesisG8KnowledgeEligibility, type GenesisG8EligibilityResult } from "./eligibility";
import { getGenesisG8EntityByCanonicalKey } from "./persistence/read-repository";
import { hydrateGenesisG8EntityTruth } from "./hydration";
import type { GenesisG8HydratedKnowledge } from "./hydration";

export interface GenesisG8KnowledgeRetrievalResult {
  hydrated: GenesisG8HydratedKnowledge;
  eligibility: GenesisG8EligibilityResult;
}

export async function retrieveGenesisG8KnowledgeById(
  entityId: string,
  options: { now?: Date; persistTruthIfChanged?: boolean } = {},
): Promise<GenesisG8KnowledgeRetrievalResult | null> {
  const hydrated = await hydrateGenesisG8EntityTruth(entityId, {
    now: options.now,
    persistIfChanged: options.persistTruthIfChanged,
  });
  if (!hydrated) return null;
  return { hydrated, eligibility: evaluateGenesisG8KnowledgeEligibility(hydrated) };
}

export async function retrieveGenesisG8KnowledgeByCanonicalKey(
  entityType: TruthEntityType,
  canonicalKey: string,
  options: { now?: Date; persistTruthIfChanged?: boolean } = {},
): Promise<GenesisG8KnowledgeRetrievalResult | null> {
  const entity = await getGenesisG8EntityByCanonicalKey(entityType, canonicalKey);
  if (!entity) return null;
  return retrieveGenesisG8KnowledgeById(entity.id, options);
}

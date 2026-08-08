import "server-only";
import { persistGenesisG8TruthSnapshot } from "./persistence/repository";
import { readGenesisG8KnowledgeBundle } from "./persistence/read-repository";
import { hydrateGenesisG8Knowledge, type GenesisG8HydratedKnowledge } from "./read-model";

export async function hydrateGenesisG8EntityTruth(
  entityId: string,
  options: { now?: Date; persistIfChanged?: boolean } = {},
): Promise<GenesisG8HydratedKnowledge | null> {
  const bundle = await readGenesisG8KnowledgeBundle(entityId);
  if (!bundle) return null;
  const hydrated = hydrateGenesisG8Knowledge(bundle, { now: options.now });
  if (options.persistIfChanged && hydrated.needsRecalculation) {
    await persistGenesisG8TruthSnapshot(bundle.entity.id, bundle.entity.contractVersion, hydrated.truth);
  }
  return hydrated;
}

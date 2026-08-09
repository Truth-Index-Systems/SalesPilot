/** Mathematical-purity input boundary for future CE-R2 deterministic kernels. */
import type { GenesisT8GraphTemporalScope } from "../commercial-graph-9d";
import type { GenesisT8AIConstraintContract } from "./constraints";

export const GENESIS_T8_CE_R2_REASONING_INPUT_VERSION = "1.0.0" as const;

export type GenesisT8CER2ReasoningInput = Readonly<{
  sellerEntityId: string;
  offeringEntityId: string;
  targetEntityId: string;
  graphSnapshotId: string;
  truthAuthorityId: string;
  ontologyVersion: string;
  ontologySemanticFingerprint: string;
  temporalScope: GenesisT8GraphTemporalScope;
  constraintContracts: readonly GenesisT8AIConstraintContract[];
}>;

export function assertCER2ReasoningInputInvariant(input: GenesisT8CER2ReasoningInput): void {
  for (const value of [input.sellerEntityId, input.offeringEntityId, input.targetEntityId, input.graphSnapshotId, input.truthAuthorityId, input.ontologyVersion, input.ontologySemanticFingerprint]) {
    if (!value.trim()) throw new Error("GENESIS_T8_CE_R2_INPUT_VIOLATION:CANONICAL_IDENTITY_REQUIRED");
  }
  if (input.constraintContracts.length === 0) throw new Error("GENESIS_T8_CE_R2_INPUT_VIOLATION:CONSTRAINT_CONTRACT_REQUIRED");
  const ids = input.constraintContracts.map((constraint) => constraint.constraintId);
  if (new Set(ids).size !== ids.length) throw new Error("GENESIS_T8_CE_R2_INPUT_VIOLATION:DUPLICATE_CONSTRAINT_ID");
  for (const constraint of input.constraintContracts) {
    if (constraint.sellerEntityId !== input.sellerEntityId || constraint.offeringEntityId !== input.offeringEntityId || constraint.targetEntityId !== input.targetEntityId) {
      throw new Error("GENESIS_T8_CE_R2_INPUT_VIOLATION:REALITY_SCOPE_MISMATCH");
    }
  }
}

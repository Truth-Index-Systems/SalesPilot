/** Constitutional constraint language. Mathematical effects are intentionally deferred to CE-R2 R2. */
import type { GenesisT8CommercialDimension } from "../commercial-graph-9d";

export const GENESIS_T8_CONSTRAINT_CONSTITUTION_VERSION = "1.0.0" as const;

export const GENESIS_T8_CONSTRAINT_CLASSES = Object.freeze([
  "BOUNDARY",
  "LIMITING",
  "SUPPORTING",
  "UNKNOWN",
  "CONTRADICTORY",
] as const);
export type GenesisT8ConstraintClass = (typeof GENESIS_T8_CONSTRAINT_CLASSES)[number];

export const GENESIS_T8_CONSTRAINT_CLASS_LAWS = Object.freeze({
  BOUNDARY: "A violated applicable boundary constraint makes the current commercial reality non-viable under the evaluated state.",
  LIMITING: "A limiting constraint restricts a surviving commercial reality but does not by itself eliminate it.",
  SUPPORTING: "A supporting constraint independently supports the coherence of a surviving commercial reality but cannot override a violated boundary constraint.",
  UNKNOWN: "An unknown constraint leaves possibility unchanged and may only reduce knowledge sufficiency or reasoning confidence.",
  CONTRADICTORY: "A contradictory constraint consumes Truth-Engine-qualified contradiction state and its commercial significance is determined only within the active reasoning dependency path.",
} satisfies Readonly<Record<GenesisT8ConstraintClass, string>>);

export type GenesisT8ConstraintApplicability = "APPLICABLE" | "NOT_APPLICABLE" | "UNRESOLVED";

export type GenesisT8AIConstraintContract = Readonly<{
  constraintId: string;
  constraintClass: GenesisT8ConstraintClass;
  sellerEntityId: string;
  offeringEntityId: string;
  targetEntityId: string;
  canonicalSubjectTokenIds: readonly string[];
  canonicalTargetTokenIds: readonly string[];
  canonicalRelationshipIds: readonly string[];
  relevantDimensions: readonly Exclude<GenesisT8CommercialDimension, "TRUTH">[];
  applicability: GenesisT8ConstraintApplicability;
  semanticDependencyKey: string;
  evidenceIds: readonly string[];
}>;

export function assertAIConstraintContractInvariant(contract: GenesisT8AIConstraintContract): void {
  if (!GENESIS_T8_CONSTRAINT_CLASSES.includes(contract.constraintClass)) throw new Error("GENESIS_T8_CE_R2_CONSTRAINT_VIOLATION:CLASS");
  for (const field of [contract.constraintId, contract.sellerEntityId, contract.offeringEntityId, contract.targetEntityId, contract.semanticDependencyKey]) {
    if (!field.trim()) throw new Error("GENESIS_T8_CE_R2_CONSTRAINT_VIOLATION:IDENTITY");
  }
  if (!(["APPLICABLE", "NOT_APPLICABLE", "UNRESOLVED"] as const).includes(contract.applicability)) throw new Error("GENESIS_T8_CE_R2_CONSTRAINT_VIOLATION:APPLICABILITY");
  const arrays = [contract.canonicalSubjectTokenIds, contract.canonicalTargetTokenIds, contract.canonicalRelationshipIds, contract.evidenceIds];
  for (const values of arrays) {
    if (values.some((value) => !value.trim()) || new Set(values).size !== values.length) throw new Error("GENESIS_T8_CE_R2_CONSTRAINT_VIOLATION:REFERENCE_SET");
  }
  if (contract.relevantDimensions.includes("TRUTH" as never)) throw new Error("GENESIS_T8_CE_R2_CONSTRAINT_VIOLATION:AI_TRUTH_DIMENSION");
}

export type GenesisT8ConstraintTrace = Readonly<{
  constraintId: string;
  source: "AI_SEMANTIC_CONTRACT";
  referencedTokenIds: readonly string[];
  referencedRelationshipIds: readonly string[];
  truthAuthorityId: string;
}>;

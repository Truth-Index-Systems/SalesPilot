/** Directed-research constitutional contract. Research prioritisation mathematics is deferred to CE-R2 R6. */
export const GENESIS_T8_DIRECTED_RESEARCH_CONSTITUTION_VERSION = "1.0.0" as const;

export type GenesisT8UnknownConstraintReference = Readonly<{
  constraintId: string;
  missingPredicateIds: readonly string[];
  relatedTokenIds: readonly string[];
}>;

export type GenesisT8DirectedResearchQuestion = Readonly<{
  realityId: string;
  unknownConstraintId: string;
  requestedPredicateIds: readonly string[];
  reasonCode: "MOST_DECISION_LIMITING_UNKNOWN";
}>;

export const GENESIS_T8_DIRECTED_RESEARCH_LAWS = Object.freeze([
  "RESEARCH_TARGETS_DECISION_RELEVANT_UNKNOWNS_NOT_GENERIC_COMPLETENESS",
  "UNKNOWN_CONSTRAINTS_MAY_TRIGGER_RESEARCH_BUT_DO_NOT_IMPLY_NEGATIVE_FACTS",
  "AI_PERFORMS_SEMANTIC_RESEARCH",
  "TI_QUALIFIES_NEWLY_DISCOVERED_KNOWLEDGE",
  "UDOSIB_RECALCULATES_FROM_THE_UPDATED_TRUTH_QUALIFIED_STATE",
  "RESEARCH_PRIORITY_MUST_BE_EXPLAINABLE_FROM_THE_ACTIVE_REASONING_TRACE",
] as const);

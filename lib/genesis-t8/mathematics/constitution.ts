/**
 * Genesis T8 CE-R2 Mathematical Constitution.
 * R1 / Build 1: constitutional laws only. No commercial equations live here.
 */
export const GENESIS_T8_CE_R2_RELEASE = "CE-R2" as const;
export const GENESIS_T8_CE_R2_R1_BUILD = "R1-BUILD1" as const;
export const GENESIS_T8_MATHEMATICAL_CONSTITUTION_VERSION = "1.0.0" as const;

export const GENESIS_T8_UDOSIB_AXIOMS = Object.freeze([
  "COMMERCIAL_REALITIES_ARE_DISCOVERED_NOT_INVENTED",
  "AI_OWNS_SEMANTIC_INTERPRETATION",
  "TRUTH_QUALIFICATION_PRECEDES_COMMERCIAL_REASONING",
  "UDOSIB_OWNS_DETERMINISTIC_CONSTRAINT_REASONING",
  "CONSTRAINTS_MAY_ELIMINATE_IMPOSSIBLE_REALITIES_BUT_CANNOT_CREATE_POSSIBILITY",
  "UNKNOWNS_REDUCE_CERTAINTY_NOT_POSSIBILITY",
  "COMMERCIAL_SIGNIFICANCE_IS_LOCAL_TO_SELLER_OFFERING_TARGET_AND_REASONING_PATH",
  "IDENTICAL_CANONICAL_INPUTS_PRODUCE_IDENTICAL_MATHEMATICAL_STATE",
  "EVERY_MATHEMATICAL_CONCLUSION_MUST_BE_RECONSTRUCTABLE",
  "OPPORTUNITY_ORDERING_FOLLOWS_SURVIVAL_NOT_PRECEDES_IT",
] as const);
export type GenesisT8UdosibAxiom = (typeof GENESIS_T8_UDOSIB_AXIOMS)[number];

export const GENESIS_T8_MATHEMATICAL_RESPONSIBILITY = Object.freeze({
  AI: Object.freeze([
    "interpret seller and offering semantics",
    "map evidence and concepts to canonical CE-R1 knowledge",
    "identify applicable commercial constraints",
    "identify semantic dependency relationships",
    "explain deterministic outputs in human language",
  ]),
  TRUTH_ENGINE: Object.freeze([
    "qualify truth",
    "qualify evidence confidence and coverage",
    "resolve evidence dependency and contradiction within truth",
    "qualify freshness",
  ]),
  UDOSIB: Object.freeze([
    "evaluate canonical constraint contracts deterministically",
    "propagate mathematical constraint state",
    "determine survival or elimination",
    "derive commercial mathematical state",
    "order surviving commercial realities deterministically",
  ]),
  APPLICATION: Object.freeze([
    "present mathematical outputs",
    "apply product access and unlock rules",
    "display AI-authored explanations grounded in deterministic trace",
  ]),
} as const);

export const GENESIS_T8_MATHEMATICAL_PURITY_LAWS = Object.freeze([
  "NO_RAW_AI_OUTPUT",
  "NO_PROMPT_TEXT",
  "NO_PROVIDER_METADATA",
  "NO_UI_STATE",
  "NO_DATABASE_LAYOUT",
  "NO_APPLICATION_WORKFLOW_STATE",
  "NO_UNQUALIFIED_KNOWLEDGE",
  "CANONICAL_CE_R1_KNOWLEDGE_ONLY",
  "AI_CONSTRAINT_CONTRACTS_MUST_BE_STRUCTURALLY_VALIDATED",
] as const);

export function assertNoEquationInConstitutionalBuild(sourceText: string): void {
  // Build 1 is intentionally pre-equation. This guard catches accidental formula/scoring implementation.
  const forbidden = [
    /weighted\s*(score|average)/i,
    /opportunity\s*score\s*=/i,
    /commercial\s*coherence\s*=/i,
    /constraint\s*pressure\s*=/i,
    /Math\.(exp|pow|log|sqrt)\s*\(/,
  ];
  if (forbidden.some((pattern) => pattern.test(sourceText))) {
    throw new Error("GENESIS_T8_CE_R2_CONSTITUTION_VIOLATION:EQUATION_BEFORE_R2");
  }
}

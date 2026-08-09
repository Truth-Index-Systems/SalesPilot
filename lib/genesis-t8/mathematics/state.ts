/** Named mathematical state concepts. Equations and numeric derivations are deferred to later CE-R2 releases. */
export const GENESIS_T8_COMMERCIAL_STATE_VERSION = "1.0.0" as const;

export const GENESIS_T8_COMMERCIAL_STATE_VARIABLES = Object.freeze([
  "COMMERCIAL_COHERENCE",
  "CAPABILITY_COMPATIBILITY",
  "OPERATIONAL_COMPATIBILITY",
  "TECHNICAL_COMPATIBILITY",
  "CONSTRAINT_PRESSURE",
  "KNOWLEDGE_SUFFICIENCY",
  "REASONING_CONFIDENCE",
  "COMMERCIAL_STABILITY",
  "OPPORTUNITY_CLASSIFICATION",
] as const);
export type GenesisT8CommercialStateVariable = (typeof GENESIS_T8_COMMERCIAL_STATE_VARIABLES)[number];

export const GENESIS_T8_STATE_SEMANTICS = Object.freeze({
  COMMERCIAL_COHERENCE: "The internal consistency of a surviving seller-offering-target commercial reality after applicable constraints are evaluated.",
  CAPABILITY_COMPATIBILITY: "The mathematical state of compatibility between truth-qualified seller capabilities and target requirements or conditions.",
  OPERATIONAL_COMPATIBILITY: "The mathematical state of operational compatibility in the active commercial reality.",
  TECHNICAL_COMPATIBILITY: "The mathematical state of technical compatibility in the active commercial reality.",
  CONSTRAINT_PRESSURE: "The aggregate restrictive pressure acting on a surviving commercial reality; its equation is not defined in R1 Build 1.",
  KNOWLEDGE_SUFFICIENCY: "Whether the truth-qualified knowledge available is sufficient for the current commercial decision.",
  REASONING_CONFIDENCE: "Confidence in the deterministic commercial conclusion given the qualified knowledge and unresolved uncertainty.",
  COMMERCIAL_STABILITY: "The resilience of a surviving commercial reality to its nearest viability boundary; its equation is not defined in R1 Build 1.",
  OPPORTUNITY_CLASSIFICATION: "A deterministic classification derived only after survival and the relevant commercial state are established.",
} satisfies Readonly<Record<GenesisT8CommercialStateVariable, string>>);

export const GENESIS_T8_STATE_LAWS = Object.freeze([
  "STATE_VARIABLES_ARE_DERIVED_REASONING_NOT_CANONICAL_KNOWLEDGE",
  "STATE_VARIABLES_MUST_NEVER_BE_PERSISTED_AS_AUTHORITATIVE_TRUTH",
  "STATE_VARIABLES_MUST_BE_RECALCULABLE_FROM_CANONICAL_INPUTS",
  "UNKNOWN_INPUTS_MUST_NOT_BE_SILENTLY_COERCED_TO_NEGATIVE_STATE",
] as const);

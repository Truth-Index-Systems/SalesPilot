/**
 * Genesis T8 CE-R2 R2 — primitive UDOSIB constraint mathematics.
 *
 * This module deliberately computes only LOCAL constraint state.
 * Graph propagation, cross-constraint dependency and opportunity ordering are
 * later releases. AI supplies semantics; TI supplies truth qualification;
 * this module supplies deterministic arithmetic only.
 */
import type { GenesisT8ConstraintApplicability, GenesisT8ConstraintClass } from "./constraints";

export const GENESIS_T8_CONSTRAINT_MATHEMATICS_VERSION = "1.1.0-TFR1" as const;
export const GENESIS_T8_CE_R2_R2_BUILD = "FORENSIC-BUILD2" as const;

export const GENESIS_T8_SEMANTIC_POLARITIES = Object.freeze([
  "SUPPORTS_REALITY",
  "OPPOSES_REALITY",
  "UNKNOWN",
] as const);
export type GenesisT8SemanticPolarity = (typeof GENESIS_T8_SEMANTIC_POLARITIES)[number];

export type GenesisT8TIConstraintTruth = Readonly<{
  /** Truth-owned effective support channel. Evidence strength, never probability. */
  supportStrength: number;
  /** Truth-owned effective contradiction channel. Evidence strength, never probability. */
  contradictionStrength: number;
  /** Quantity of represented evidence independent of direction. */
  evidenceSufficiency: number;
  /** Whether the proposition itself is represented in the active Truth contract. */
  coverage: number;
  /** Truth-owned contradiction severity in [0,1]. CE-R2 never recalculates it. */
  contradictionSeverity: number;
}>;

export type GenesisT8ConstraintMathInput = Readonly<{
  constraintId: string;
  constraintClass: GenesisT8ConstraintClass;
  applicability: GenesisT8ConstraintApplicability;
  /** AI-owned semantic direction. This is categorical, never a numeric weight. */
  semanticPolarity: GenesisT8SemanticPolarity;
  truth: GenesisT8TIConstraintTruth | null;
}>;

export type GenesisT8ConstraintMathState = Readonly<{
  constraintId: string;
  constraintClass: GenesisT8ConstraintClass;
  applicability: GenesisT8ConstraintApplicability;
  semanticPolarity: GenesisT8SemanticPolarity;
  /** Signed local truth signal in [-1,1]. Positive supports reality; negative opposes it. */
  signedTruthSignal: number;
  /** Positive support available to this local constraint. */
  supportStrength: number;
  /** Positive restrictive force available to this local constraint. */
  limitingPressure: number;
  /** Boundary-only evidence supporting elimination. This is NOT itself an elimination decision. */
  boundaryEliminationSupport: number;
  /** Boundary-only evidence supporting survival. */
  boundarySurvivalSupport: number;
  /** TI-owned contradiction uncertainty carried forward without commercial weighting. */
  contradictionUncertainty: number;
  /** Knowledge represented strongly enough to support reasoning, independent of fit. */
  representedKnowledge: number;
  /** Unresolved knowledge mass, independent of commercial viability. */
  knowledgeDeficit: number;
  /** Local state label. Final survival/elimination is deferred to propagation. */
  localState:
    | "INACTIVE"
    | "UNRESOLVED"
    | "NEUTRAL"
    | "SUPPORTIVE"
    | "LIMITING"
    | "BOUNDARY_SUPPORTS_SURVIVAL"
    | "BOUNDARY_SUPPORTS_ELIMINATION"
    | "CONTRADICTED";
}>;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
const cleanZero = (value: number): number => Math.abs(value) < 1e-12 ? 0 : value;

export function assertTIConstraintTruthInvariant(truth: GenesisT8TIConstraintTruth): void {
  for (const [name, value] of Object.entries(truth)) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error(`GENESIS_T8_CE_R2_CONSTRAINT_MATH_VIOLATION:TI_${name.toUpperCase()}_BOUND`);
    }
  }
}

export function assertConstraintMathInputInvariant(input: GenesisT8ConstraintMathInput): void {
  if (!input.constraintId?.trim()) throw new Error("GENESIS_T8_CE_R2_CONSTRAINT_MATH_VIOLATION:CONSTRAINT_ID");
  if (!("BOUNDARY,LIMITING,SUPPORTING,UNKNOWN,CONTRADICTORY".split(",") as readonly string[]).includes(input.constraintClass)) {
    throw new Error("GENESIS_T8_CE_R2_CONSTRAINT_MATH_VIOLATION:CLASS");
  }
  if (!("APPLICABLE,NOT_APPLICABLE,UNRESOLVED".split(",") as readonly string[]).includes(input.applicability)) {
    throw new Error("GENESIS_T8_CE_R2_CONSTRAINT_MATH_VIOLATION:APPLICABILITY");
  }
  if (!GENESIS_T8_SEMANTIC_POLARITIES.includes(input.semanticPolarity)) {
    throw new Error("GENESIS_T8_CE_R2_CONSTRAINT_MATH_VIOLATION:POLARITY");
  }
  if (input.truth) assertTIConstraintTruthInvariant(input.truth);
  if (input.semanticPolarity !== "UNKNOWN" && input.applicability === "APPLICABLE" && !input.truth) {
    throw new Error("GENESIS_T8_CE_R2_CONSTRAINT_MATH_VIOLATION:APPLICABLE_POLARITY_REQUIRES_TI_TRUTH");
  }
}

/**
 * Resolve directional force directly from Truth-owned evidence channels.
 *
 * r = support - contradiction, r in [-1,1]
 *
 * This is the forensic TFR1 bridge: weak positive support remains positive,
 * weak contradiction remains negative, and uncalibrated evidence is never
 * smuggled into CE-R2 as a pseudo-probability with a synthetic 0.5 midpoint.
 */
export function resolvedTruthSignal(supportStrength: number, contradictionStrength: number): number {
  const support = clamp01(supportStrength);
  const contradiction = clamp01(contradictionStrength);
  return cleanZero(Math.max(-1, Math.min(1, support - contradiction)));
}

/** AI supplies only categorical semantic direction; mathematics supplies sign. */
export function applySemanticPolarity(signal: number, polarity: GenesisT8SemanticPolarity): number {
  if (polarity === "UNKNOWN") return 0;
  return cleanZero(polarity === "SUPPORTS_REALITY" ? signal : -signal);
}

/**
 * Knowledge is kept orthogonal to commercial possibility.
 * k = coverage * evidence sufficiency
 */
export function representedKnowledge(coverage: number, evidenceSufficiency: number): number {
  return clamp01(coverage) * clamp01(evidenceSufficiency);
}

/** TI contradiction severity is an upstream mathematical result; CE-R2 carries it forward unchanged. */
export function tiContradictionUncertainty(severity: number): number {
  return clamp01(severity);
}

export function evaluateLocalConstraint(input: GenesisT8ConstraintMathInput): GenesisT8ConstraintMathState {
  assertConstraintMathInputInvariant(input);

  if (input.applicability === "NOT_APPLICABLE") {
    return Object.freeze({
      constraintId: input.constraintId, constraintClass: input.constraintClass, applicability: input.applicability,
      semanticPolarity: input.semanticPolarity, signedTruthSignal: 0, supportStrength: 0, limitingPressure: 0,
      boundaryEliminationSupport: 0, boundarySurvivalSupport: 0, contradictionUncertainty: 0,
      representedKnowledge: 0, knowledgeDeficit: 0, localState: "INACTIVE" as const,
    });
  }

  if (input.applicability === "UNRESOLVED" || input.semanticPolarity === "UNKNOWN" || !input.truth) {
    const knowledge = input.truth ? representedKnowledge(input.truth.coverage, input.truth.evidenceSufficiency) : 0;
    const contradiction = input.truth ? tiContradictionUncertainty(input.truth.contradictionSeverity) : 0;
    return Object.freeze({
      constraintId: input.constraintId, constraintClass: input.constraintClass, applicability: input.applicability,
      semanticPolarity: input.semanticPolarity, signedTruthSignal: 0, supportStrength: 0, limitingPressure: 0,
      boundaryEliminationSupport: 0, boundarySurvivalSupport: 0, contradictionUncertainty: contradiction,
      representedKnowledge: knowledge, knowledgeDeficit: 1 - knowledge, localState: "UNRESOLVED" as const,
    });
  }

  const baseSignal = resolvedTruthSignal(input.truth.supportStrength, input.truth.contradictionStrength);
  const signed = applySemanticPolarity(baseSignal, input.semanticPolarity);
  const support = Math.max(0, signed);
  const opposition = Math.max(0, -signed);
  const knowledge = representedKnowledge(input.truth.coverage, input.truth.evidenceSufficiency);
  const contradiction = tiContradictionUncertainty(input.truth.contradictionSeverity);

  let supportStrength = 0;
  let limitingPressure = 0;
  let boundaryEliminationSupport = 0;
  let boundarySurvivalSupport = 0;
  let localState: GenesisT8ConstraintMathState["localState"] = "NEUTRAL";

  switch (input.constraintClass) {
    case "BOUNDARY":
      boundarySurvivalSupport = support;
      boundaryEliminationSupport = opposition;
      localState = opposition > support
        ? "BOUNDARY_SUPPORTS_ELIMINATION"
        : support > opposition
          ? "BOUNDARY_SUPPORTS_SURVIVAL"
          : "NEUTRAL";
      break;
    case "LIMITING":
      limitingPressure = opposition;
      localState = limitingPressure > 0 ? "LIMITING" : "NEUTRAL";
      break;
    case "SUPPORTING":
      supportStrength = support;
      localState = supportStrength > 0 ? "SUPPORTIVE" : "NEUTRAL";
      break;
    case "UNKNOWN":
      localState = "UNRESOLVED";
      break;
    case "CONTRADICTORY":
      // Contradiction never directly changes viability in R2. TI supplies its severity;
      // commercial dependency weighting and propagation are deliberately R3 concerns.
      localState = contradiction > 0 ? "CONTRADICTED" : "NEUTRAL";
      break;
  }

  return Object.freeze({
    constraintId: input.constraintId,
    constraintClass: input.constraintClass,
    applicability: input.applicability,
    semanticPolarity: input.semanticPolarity,
    signedTruthSignal: signed,
    supportStrength,
    limitingPressure,
    boundaryEliminationSupport,
    boundarySurvivalSupport,
    contradictionUncertainty: contradiction,
    representedKnowledge: knowledge,
    knowledgeDeficit: 1 - knowledge,
    localState,
  });
}

export const GENESIS_T8_CONSTRAINT_MATHEMATICS_LAWS = Object.freeze([
  "NO_ARBITRARY_COMMERCIAL_WEIGHTS_IN_PRIMITIVE_CONSTRAINT_MATH",
  "TRUTH_SUPPORT_MINUS_CONTRADICTION_DETERMINES_DIRECTIONAL_FORCE",
  "UNCALIBRATED_EVIDENCE_IS_NEVER_CONSUMED_AS_PROBABILITY",
  "TRUTH_EVIDENCE_SUFFICIENCY_CONTROLS_REPRESENTED_KNOWLEDGE",
  "TI_COVERAGE_AFFECTS_KNOWLEDGE_NOT_COMMERCIAL_DIRECTION",
  "AI_SUPPLIES_CATEGORICAL_SEMANTIC_POLARITY_NOT_NUMERIC_WEIGHT",
  "BOUNDARY_OUTPUT_IS_ELIMINATION_SUPPORT_NOT_PREMATURE_BINARY_ELIMINATION",
  "LIMITING_CONSTRAINTS_CREATE_RESTRICTIVE_PRESSURE_ONLY",
  "SUPPORTING_CONSTRAINTS_CANNOT_CREATE_NEGATIVE_PRESSURE",
  "UNKNOWN_CONSTRAINTS_HAVE_ZERO_VIABILITY_FORCE",
  "TI_CONTRADICTION_SEVERITY_IS_PRESERVED_WITHOUT_RECALCULATION",
  "COMMERCIAL_DEPENDENCY_WEIGHTING_IS_DEFERRED_TO_R3_PROPAGATION",
] as const);

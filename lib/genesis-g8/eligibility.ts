import type { GenesisG8HydratedKnowledge, GenesisG8IntelligenceGap } from "./read-model";

export type GenesisG8KnowledgeEligibility =
  | "READY"
  | "READY_WITH_GAPS"
  | "REFRESH_REQUIRED"
  | "HUMAN_REVIEW_REQUIRED"
  | "NOT_USABLE";

export type GenesisG8KnowledgeDirective =
  | "USE_KNOWLEDGE"
  | "USE_KNOWLEDGE_WITH_GAP_REPAIR"
  | "REFRESH_THEN_USE"
  | "HUMAN_REVIEW"
  | "DISCOVERY_ONLY";

export type GenesisG8EligibilityReason =
  | "ENTITY_SUPPRESSED"
  | "ENTITY_SUPERSEDED"
  | "HUMAN_REJECTED"
  | "EXPLICIT_REVIEW_PENDING"
  | "MATERIAL_CONTRADICTION"
  | "CRITICAL_GAP"
  | "STALE_CRITICAL_OR_REQUIRED"
  | "LOW_TRUTH_INDEX"
  | "LOW_CONFIDENCE"
  | "LOW_COVERAGE"
  | "NONCRITICAL_GAPS"
  | "HUMAN_APPROVED_OVERRIDE";

export interface GenesisG8EligibilityPolicy {
  readyTruthIndex: number;
  readyConfidence: number;
  readyCoverage: number;
  minimumUsableTruthIndex: number;
  minimumUsableConfidence: number;
  materialContradiction: number;
}

export const DEFAULT_GENESIS_G8_ELIGIBILITY_POLICY: GenesisG8EligibilityPolicy = {
  readyTruthIndex: 85,
  readyConfidence: 80,
  readyCoverage: 80,
  minimumUsableTruthIndex: 55,
  minimumUsableConfidence: 60,
  materialContradiction: 35,
};

export interface GenesisG8EligibilityResult {
  status: GenesisG8KnowledgeEligibility;
  directive: GenesisG8KnowledgeDirective;
  usable: boolean;
  reasons: GenesisG8EligibilityReason[];
  truthIndex: number;
  confidence: number;
  coverage: number;
  reviewState: GenesisG8HydratedKnowledge["entity"]["reviewState"];
  entityStatus: GenesisG8HydratedKnowledge["entity"]["status"];
  blockingGaps: GenesisG8IntelligenceGap[];
  repairableGaps: GenesisG8IntelligenceGap[];
  evaluatedAt: string;
}

const isMaterialGap = (gap: GenesisG8IntelligenceGap) => gap.criticality === "CRITICAL" || gap.criticality === "REQUIRED";
const isCriticalGap = (gap: GenesisG8IntelligenceGap) => gap.criticality === "CRITICAL";
const isStaleGap = (gap: GenesisG8IntelligenceGap) => gap.reason === "STALE_EVIDENCE";
const isContradictedGap = (gap: GenesisG8IntelligenceGap) => gap.reason === "CONTRADICTED";

function result(
  hydrated: GenesisG8HydratedKnowledge,
  status: GenesisG8KnowledgeEligibility,
  directive: GenesisG8KnowledgeDirective,
  reasons: GenesisG8EligibilityReason[],
  blockingGaps: GenesisG8IntelligenceGap[],
  repairableGaps: GenesisG8IntelligenceGap[],
): GenesisG8EligibilityResult {
  return {
    status,
    directive,
    usable: status === "READY" || status === "READY_WITH_GAPS",
    reasons: [...new Set(reasons)],
    truthIndex: hydrated.truth.truthIndex,
    confidence: hydrated.truth.confidence,
    coverage: hydrated.truth.coverage,
    reviewState: hydrated.entity.reviewState,
    entityStatus: hydrated.entity.status,
    blockingGaps,
    repairableGaps,
    evaluatedAt: hydrated.hydratedAt,
  };
}

/**
 * Determines whether already-known intelligence can be used by MarketRoute.
 * This function does not change Truth Index, mutate review state, call AI, or
 * choose a commercial opportunity. It only classifies current knowledge.
 */
export function evaluateGenesisG8KnowledgeEligibility(
  hydrated: GenesisG8HydratedKnowledge,
  policy: GenesisG8EligibilityPolicy = DEFAULT_GENESIS_G8_ELIGIBILITY_POLICY,
): GenesisG8EligibilityResult {
  const reasons: GenesisG8EligibilityReason[] = [];
  const allGaps = hydrated.gaps;
  const materialGaps = allGaps.filter(isMaterialGap);
  const criticalGaps = allGaps.filter(isCriticalGap);
  const contradictedMaterial = materialGaps.filter(isContradictedGap);
  const staleMaterial = materialGaps.filter(isStaleGap);
  const nonCriticalGaps = allGaps.filter((gap) => !isMaterialGap(gap));

  if (hydrated.entity.status === "SUPPRESSED") {
    reasons.push("ENTITY_SUPPRESSED");
    if (hydrated.entity.reviewState === "HUMAN_REJECTED") reasons.push("HUMAN_REJECTED");
    return result(hydrated, "NOT_USABLE", "DISCOVERY_ONLY", reasons, allGaps, []);
  }

  if (hydrated.entity.status === "SUPERSEDED") {
    return result(hydrated, "NOT_USABLE", "DISCOVERY_ONLY", ["ENTITY_SUPERSEDED"], allGaps, []);
  }

  if (hydrated.entity.reviewState === "HUMAN_REJECTED") {
    return result(hydrated, "NOT_USABLE", "DISCOVERY_ONLY", ["HUMAN_REJECTED"], allGaps, []);
  }

  // Founder approval is an eligibility override, never a Truth override. The
  // mathematical score and gaps remain unchanged and can continue to be repaired
  // in the background, but the approved intelligence may be used operationally.
  if (hydrated.entity.reviewState === "HUMAN_APPROVED") {
    return result(hydrated, "READY_WITH_GAPS", "USE_KNOWLEDGE_WITH_GAP_REPAIR", ["HUMAN_APPROVED_OVERRIDE"], [], allGaps);
  }

  if (hydrated.entity.reviewState === "NEEDS_REVIEW") {
    return result(hydrated, "HUMAN_REVIEW_REQUIRED", "HUMAN_REVIEW", ["EXPLICIT_REVIEW_PENDING"], materialGaps, nonCriticalGaps);
  }

  if (contradictedMaterial.length > 0 || hydrated.truth.claims.some((claim) => claim.contradiction >= policy.materialContradiction && (claim.criticality === "CRITICAL" || claim.criticality === "REQUIRED"))) {
    return result(hydrated, "HUMAN_REVIEW_REQUIRED", "HUMAN_REVIEW", ["MATERIAL_CONTRADICTION"], contradictedMaterial.length ? contradictedMaterial : materialGaps, nonCriticalGaps);
  }

  if (staleMaterial.length > 0) {
    return result(hydrated, "REFRESH_REQUIRED", "REFRESH_THEN_USE", ["STALE_CRITICAL_OR_REQUIRED"], staleMaterial, allGaps.filter((gap) => !staleMaterial.includes(gap)));
  }

  const unresolvedCritical = criticalGaps.filter((gap) => gap.reason !== "STALE_EVIDENCE");
  if (unresolvedCritical.length > 0) {
    return result(hydrated, "HUMAN_REVIEW_REQUIRED", "HUMAN_REVIEW", ["CRITICAL_GAP"], unresolvedCritical, allGaps.filter((gap) => !unresolvedCritical.includes(gap)));
  }

  const { truthIndex, confidence, coverage } = hydrated.truth;
  const meetsReadyFloor = truthIndex >= policy.readyTruthIndex
    && confidence >= policy.readyConfidence
    && coverage >= policy.readyCoverage;

  if (meetsReadyFloor && allGaps.length === 0) {
    return result(hydrated, "READY", "USE_KNOWLEDGE", [], [], []);
  }

  const meetsUsableFloor = truthIndex >= policy.minimumUsableTruthIndex
    && confidence >= policy.minimumUsableConfidence;

  if (meetsUsableFloor && materialGaps.length === 0) {
    if (coverage < policy.readyCoverage) reasons.push("LOW_COVERAGE");
    if (nonCriticalGaps.length > 0) reasons.push("NONCRITICAL_GAPS");
    return result(hydrated, "READY_WITH_GAPS", "USE_KNOWLEDGE_WITH_GAP_REPAIR", reasons, [], nonCriticalGaps);
  }

  if (truthIndex < policy.minimumUsableTruthIndex) reasons.push("LOW_TRUTH_INDEX");
  if (confidence < policy.minimumUsableConfidence) reasons.push("LOW_CONFIDENCE");
  if (coverage < policy.readyCoverage) reasons.push("LOW_COVERAGE");
  return result(hydrated, "NOT_USABLE", "DISCOVERY_ONLY", reasons, materialGaps, nonCriticalGaps);
}

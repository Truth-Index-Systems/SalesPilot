/**
 * CIE-R4 Commercial Decision Authority.
 *
 * Promotes Commercial Reality + CE2 stability to the authoritative commercial
 * decision object. Route/contact ranking remain outside R4 and therefore R4
 * never unlocks engagement by itself.
 */
import type { CieR3CompositionResult } from "./truth-ce2-bridge";
import {
  evaluateMultidimensionalStability,
  type GenesisT8MultidimensionalStability,
} from "../ce2-evolution/multidimensional-stability";
import type { GenesisT8CoherenceConstraintContext } from "../mathematics/commercial-coherence";
import type { GenesisT8CommercialRealityPropagation } from "../mathematics/constraint-propagation";

export const CIE_R4_VERSION = "1.0.0" as const;
export const CIE_R4_AUTHORITY_MODE = "AUTHORITATIVE" as const;

export type CieR4CommercialDisposition =
  | "REJECT"
  | "HOLD_TEMPORAL"
  | "RESEARCH_REQUIRED"
  | "COMMERCIAL_CANDIDATE";

export type CieR4CommercialDecisionInput = Readonly<{
  opportunityId: string;
  composition: CieR3CompositionResult;
  propagation: GenesisT8CommercialRealityPropagation;
  constraintContexts: readonly GenesisT8CoherenceConstraintContext[];
}>;

export type CieR4CommercialDecision = Readonly<{
  schema: "cie_r4_commercial_decision/v1";
  authorityMode: "AUTHORITATIVE";
  opportunityId: string;
  realityId: string;
  targetEntityId: string;
  realityState: CieR3CompositionResult["decision"]["state"];
  disposition: CieR4CommercialDisposition;
  stability: GenesisT8MultidimensionalStability;
  canUnlockEngagement: false;
  deterministicReasons: readonly string[];
}>;

function canonicalId(value: string, code: string): string {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) {
    throw new Error(`CIE_R4_VIOLATION:${code}`);
  }
  return value;
}

function dispositionFor(state: CieR3CompositionResult["decision"]["state"]): CieR4CommercialDisposition {
  if (state === "IMPOSSIBLE" || state === "EXPIRED") return "REJECT";
  if (state === "DORMANT") return "HOLD_TEMPORAL";
  if (state === "UNRESOLVED" || state === "CONTESTED") return "RESEARCH_REQUIRED";
  return "COMMERCIAL_CANDIDATE";
}

export function evaluateCieR4CommercialDecision(input: CieR4CommercialDecisionInput): CieR4CommercialDecision {
  const opportunityId = canonicalId(input.opportunityId, "OPPORTUNITY_ID");
  if (input.composition.authorityMode !== "SHADOW") {
    throw new Error("CIE_R4_VIOLATION:R3_COMPOSITION_MUST_ENTER_AS_SHADOW_EVIDENCE");
  }
  const stability = evaluateMultidimensionalStability(input.propagation, input.constraintContexts);
  if (stability.viability !== input.composition.reality.commercial.viability) {
    throw new Error("CIE_R4_VIOLATION:STABILITY_VIABILITY_MISMATCH");
  }

  const disposition = dispositionFor(input.composition.decision.state);
  return Object.freeze({
    schema: "cie_r4_commercial_decision/v1",
    authorityMode: CIE_R4_AUTHORITY_MODE,
    opportunityId,
    realityId: input.composition.reality.realityId,
    targetEntityId: input.composition.reality.identity.targetEntityId,
    realityState: input.composition.decision.state,
    disposition,
    stability,
    // R5/R6 have not yet migrated route/contact authority. R4 therefore cannot
    // make an engagement executable even when commercial reality is established.
    canUnlockEngagement: false,
    deterministicReasons: Object.freeze([
      `REALITY_STATE:${input.composition.decision.state}`,
      `COMMERCIAL_DISPOSITION:${disposition}`,
      `STABILITY_FLOOR:${stability.globalStabilityFloor}`,
      `CRITICAL_DIMENSIONS:${stability.criticalDimensions.join(",") || "NONE"}`,
      "CIE_R4_IS_SOLE_COMMERCIAL_DECISION_AUTHORITY",
      "LEGACY_OPPORTUNITY_SCORE_HAS_NO_DECISION_AUTHORITY",
      "ROUTE_AND_CONTACT_AUTHORITY_ARE_NOT_YET_MIGRATED",
      "R4_CANNOT_UNLOCK_ENGAGEMENT",
    ]),
  });
}

export const CIE_R4_LAWS = Object.freeze([
  "COMMERCIAL_REALITY_PRECEDES_OPPORTUNITY_STATE",
  "R3_SHADOW_COMPOSITION_MAY_BE_PROMOTED_ONLY_BY_R4_DETERMINISTIC_AUTHORITY",
  "STABILITY_IS_RECOMPUTED_FROM_FROZEN_PROPAGATION_NOT_ACCEPTED_AS_EXTERNAL_SCORE",
  "LEGACY_OPPORTUNITY_SCORE_CANNOT_CONTROL_COMMERCIAL_DISPOSITION",
  "IMPOSSIBLE_OR_EXPIRED_REALITY_IS_REJECTED",
  "DORMANT_REALITY_IS_TEMPORALLY_HELD",
  "UNRESOLVED_OR_CONTESTED_REALITY_REQUIRES_RESEARCH",
  "POSSIBLE_OR_ESTABLISHED_REALITY_IS_A_COMMERCIAL_CANDIDATE",
  "R4_CANNOT_UNLOCK_ENGAGEMENT_BEFORE_ROUTE_AND_CONTACT_AUTHORITY_MIGRATE",
  "NO_AI_SCORE_WEIGHT_PROBABILITY_OR_LEGACY_RANK_MAY_ENTER_R4_AUTHORITY",
] as const);

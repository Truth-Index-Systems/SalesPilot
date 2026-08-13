/**
 * MarketRoute Forensic Build 8 — mandatory commercial boundary constitution.
 *
 * The constitution answers a different question from CE-R2 mathematics:
 * before a commercial reality may be called a candidate, which boundary
 * questions MUST be represented and non-unresolved? This prevents an open-world
 * omission from being silently interpreted as "no restriction exists".
 */
import type { GenesisT8ConstraintMathState } from "../mathematics/constraint-mathematics";

export const MARKETROUTE_FORENSIC_BUILD8_BOUNDARY_CONSTITUTION_VERSION = "MR-T8-FB8-BOUNDARY-1.0.0" as const;
export const MARKETROUTE_FORENSIC_BUILD8_REALITY_CLASS = "SELLER_TO_TARGET_COMMERCIAL_ENGAGEMENT" as const;
export const MARKETROUTE_FORENSIC_BUILD8_BOUNDARY_SCHEMA = "marketroute_fb8_boundary_completeness/v1" as const;

export type Build8RequiredBoundaryKey =
  | "seller.has_persisted_commercial_offering"
  | "seller.selected_commercial_objective"
  | "target.identity"
  | "target.canonical_domain"
  | "target.current_operation";

export type Build8RequiredBoundaryDefinition = Readonly<{
  key: Build8RequiredBoundaryKey;
  stage: "R4";
  meaning: string;
}>;

export const MARKETROUTE_FORENSIC_BUILD8_REQUIRED_BOUNDARIES: readonly Build8RequiredBoundaryDefinition[] = Object.freeze([
  Object.freeze({ key: "seller.has_persisted_commercial_offering", stage: "R4", meaning: "The seller has at least one persisted commercial offering." }),
  Object.freeze({ key: "seller.selected_commercial_objective", stage: "R4", meaning: "The reasoning remains scoped to the selected immutable commercial objective." }),
  Object.freeze({ key: "target.identity", stage: "R4", meaning: "The target company identity is represented in current TFR1 Truth." }),
  Object.freeze({ key: "target.canonical_domain", stage: "R4", meaning: "The target canonical domain is represented in current TFR1 Truth and DB lineage binds it to the opportunity company." }),
  Object.freeze({ key: "target.current_operation", stage: "R4", meaning: "The target is represented as currently operating." }),
]);

export type Build8BoundaryCompleteness = Readonly<{
  schema: typeof MARKETROUTE_FORENSIC_BUILD8_BOUNDARY_SCHEMA;
  constitutionVersion: typeof MARKETROUTE_FORENSIC_BUILD8_BOUNDARY_CONSTITUTION_VERSION;
  realityClass: typeof MARKETROUTE_FORENSIC_BUILD8_REALITY_CLASS;
  requiredBoundaryKeys: readonly Build8RequiredBoundaryKey[];
  representedBoundaryKeys: readonly Build8RequiredBoundaryKey[];
  unresolvedBoundaryKeys: readonly Build8RequiredBoundaryKey[];
  missingMandatoryBoundaryKeys: readonly Build8RequiredBoundaryKey[];
  complete: boolean;
  downstreamRequirements: readonly ["R5_EVIDENCE_QUALIFIED_RELATIONSHIP_PATH", "R6_TRUTH_QUALIFIED_CONTACT_OR_ORGANISATIONAL_BINDING"];
}>;

export type Build8BoundaryObservation = Readonly<{
  key: Build8RequiredBoundaryKey;
  constraintId: string | null;
  state: GenesisT8ConstraintMathState | null;
}>;

/**
 * Contract completeness is categorical. No score or confidence threshold can
 * turn a missing/unresolved mandatory question into completeness.
 */
export function evaluateBuild8BoundaryCompleteness(observations: readonly Build8BoundaryObservation[]): Build8BoundaryCompleteness {
  const byKey = new Map(observations.map((observation) => [observation.key, observation] as const));
  const represented: Build8RequiredBoundaryKey[] = [];
  const unresolved: Build8RequiredBoundaryKey[] = [];
  const missing: Build8RequiredBoundaryKey[] = [];

  for (const definition of MARKETROUTE_FORENSIC_BUILD8_REQUIRED_BOUNDARIES) {
    const observation = byKey.get(definition.key);
    if (!observation?.constraintId || !observation.state) {
      missing.push(definition.key);
      continue;
    }
    represented.push(definition.key);
    if (observation.state.applicability === "UNRESOLVED" || observation.state.localState === "UNRESOLVED") {
      unresolved.push(definition.key);
    }
  }

  const requiredBoundaryKeys = MARKETROUTE_FORENSIC_BUILD8_REQUIRED_BOUNDARIES.map((definition) => definition.key);
  return Object.freeze({
    schema: MARKETROUTE_FORENSIC_BUILD8_BOUNDARY_SCHEMA,
    constitutionVersion: MARKETROUTE_FORENSIC_BUILD8_BOUNDARY_CONSTITUTION_VERSION,
    realityClass: MARKETROUTE_FORENSIC_BUILD8_REALITY_CLASS,
    requiredBoundaryKeys: Object.freeze([...requiredBoundaryKeys]),
    representedBoundaryKeys: Object.freeze([...represented].sort()),
    unresolvedBoundaryKeys: Object.freeze([...unresolved].sort()),
    missingMandatoryBoundaryKeys: Object.freeze([...missing].sort()),
    complete: missing.length === 0 && unresolved.length === 0,
    downstreamRequirements: Object.freeze(["R5_EVIDENCE_QUALIFIED_RELATIONSHIP_PATH", "R6_TRUTH_QUALIFIED_CONTACT_OR_ORGANISATIONAL_BINDING"] as const),
  });
}

export function assertBuild8CommercialCandidateBoundaryCompleteness(
  disposition: string,
  completeness: Build8BoundaryCompleteness,
): void {
  if (disposition === "COMMERCIAL_CANDIDATE" && !completeness.complete) {
    throw new Error("MR_FB8_CONSTITUTION_VIOLATION:COMMERCIAL_CANDIDATE_WITH_INCOMPLETE_BOUNDARY_CONTRACT");
  }
}

/**
 * Genesis T8 CE-R2 R3 — deterministic UDOSIB constraint propagation.
 *
 * R2 computes LOCAL constraint state. R3 moves only those already-computed
 * mathematical channels through an AI-defined categorical dependency DAG.
 *
 * AI owns the semantics of whether a dependency exists and which categorical
 * propagation mode applies. UDOSIB never invents semantic dependencies and
 * never accepts numeric dependency weights from AI.
 */
import type { GenesisT8ConstraintMathState } from "./constraint-mathematics";

export const GENESIS_T8_CONSTRAINT_PROPAGATION_VERSION = "1.0.0" as const;
export const GENESIS_T8_CE_R2_R3_BUILD = "R3-BUILD1" as const;

export const GENESIS_T8_DEPENDENCY_MODES = Object.freeze([
  "REQUIRED",
  "LIMITING",
  "SUPPORTING",
  "INFORMATIONAL",
] as const);
export type GenesisT8DependencyMode = (typeof GENESIS_T8_DEPENDENCY_MODES)[number];

/**
 * Semantic dependency edges are categorical contracts produced by AI.
 * There is deliberately no numeric weight/importance/attenuation field.
 */
export type GenesisT8ConstraintDependency = Readonly<{
  dependencyId: string;
  fromConstraintId: string;
  toConstraintId: string;
  mode: GenesisT8DependencyMode;
  semanticDependencyKey: string;
}>;

export type GenesisT8PropagatedConstraintState = Readonly<{
  constraintId: string;
  /** R2 local values remain visible for complete explainability. */
  local: GenesisT8ConstraintMathState;
  effectiveSupportStrength: number;
  effectiveLimitingPressure: number;
  effectiveBoundaryEliminationSupport: number;
  effectiveBoundarySurvivalSupport: number;
  /** TI contradiction severity after dependency relevance has been applied. */
  relevantContradictionUncertainty: number;
  /** Knowledge deficit may propagate through any active dependency. */
  effectiveKnowledgeDeficit: number;
  incomingDependencyIds: readonly string[];
}>;

export type GenesisT8CommercialRealityPropagation = Readonly<{
  orderedConstraintIds: readonly string[];
  states: readonly GenesisT8PropagatedConstraintState[];
  /**
   * R3 is allowed to resolve boundary survival because R2 deliberately deferred
   * that decision. Supporting/limiting constraints can never override it.
   */
  viability: "SURVIVES" | "ELIMINATED" | "UNRESOLVED";
  eliminatingConstraintIds: readonly string[];
  unresolvedBoundaryConstraintIds: readonly string[];
}>;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
const max = (...values: readonly number[]): number => values.length ? Math.max(...values.map(clamp01)) : 0;

export function assertConstraintDependencyInvariant(dependency: GenesisT8ConstraintDependency): void {
  if (!dependency.dependencyId?.trim()) throw new Error("GENESIS_T8_CE_R2_R3_VIOLATION:DEPENDENCY_ID");
  if (!dependency.fromConstraintId?.trim() || !dependency.toConstraintId?.trim()) throw new Error("GENESIS_T8_CE_R2_R3_VIOLATION:DEPENDENCY_ENDPOINT");
  if (dependency.fromConstraintId === dependency.toConstraintId) throw new Error("GENESIS_T8_CE_R2_R3_VIOLATION:SELF_DEPENDENCY");
  if (!GENESIS_T8_DEPENDENCY_MODES.includes(dependency.mode)) throw new Error("GENESIS_T8_CE_R2_R3_VIOLATION:DEPENDENCY_MODE");
  if (!dependency.semanticDependencyKey?.trim()) throw new Error("GENESIS_T8_CE_R2_R3_VIOLATION:SEMANTIC_DEPENDENCY_KEY");
  for (const forbidden of ["weight", "score", "probability", "confidence", "importance", "attenuation"]) {
    if (Object.prototype.hasOwnProperty.call(dependency as object, forbidden)) {
      throw new Error(`GENESIS_T8_CE_R2_R3_VIOLATION:NUMERIC_SEMANTIC_WEIGHT:${forbidden}`);
    }
  }
}

export function canonicalConstraintDependencyKey(dependency: Pick<GenesisT8ConstraintDependency, "fromConstraintId" | "toConstraintId" | "mode" | "semanticDependencyKey">): string {
  return [dependency.fromConstraintId, dependency.toConstraintId, dependency.mode, dependency.semanticDependencyKey].join("\u001f");
}

function topologicalConstraintOrder(
  states: readonly GenesisT8ConstraintMathState[],
  dependencies: readonly GenesisT8ConstraintDependency[],
): readonly string[] {
  const ids = new Set(states.map((state) => state.constraintId));
  const indegree = new Map<string, number>([...ids].map((id) => [id, 0]));
  const outgoing = new Map<string, GenesisT8ConstraintDependency[]>();
  const dependencyIds = new Set<string>();
  const dependencyKeys = new Set<string>();

  for (const dependency of dependencies) {
    assertConstraintDependencyInvariant(dependency);
    if (!ids.has(dependency.fromConstraintId) || !ids.has(dependency.toConstraintId)) throw new Error("GENESIS_T8_CE_R2_R3_VIOLATION:DEPENDENCY_CONSTRAINT_MISSING");
    if (dependencyIds.has(dependency.dependencyId)) throw new Error("GENESIS_T8_CE_R2_R3_VIOLATION:DUPLICATE_DEPENDENCY_ID");
    dependencyIds.add(dependency.dependencyId);
    const key = canonicalConstraintDependencyKey(dependency);
    if (dependencyKeys.has(key)) throw new Error("GENESIS_T8_CE_R2_R3_VIOLATION:DUPLICATE_DEPENDENCY_SEMANTICS");
    dependencyKeys.add(key);
    indegree.set(dependency.toConstraintId, (indegree.get(dependency.toConstraintId) ?? 0) + 1);
    outgoing.set(dependency.fromConstraintId, [...(outgoing.get(dependency.fromConstraintId) ?? []), dependency]);
  }

  const ready = [...ids].filter((id) => indegree.get(id) === 0).sort((a, b) => a.localeCompare(b));
  const ordered: string[] = [];
  while (ready.length) {
    const id = ready.shift()!;
    ordered.push(id);
    for (const dependency of [...(outgoing.get(id) ?? [])].sort((a, b) => a.dependencyId.localeCompare(b.dependencyId))) {
      const next = dependency.toConstraintId;
      const degree = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, degree);
      if (degree === 0) {
        ready.push(next);
        ready.sort((a, b) => a.localeCompare(b));
      }
    }
  }
  if (ordered.length !== ids.size) throw new Error("GENESIS_T8_CE_R2_R3_VIOLATION:DEPENDENCY_CYCLE");
  return Object.freeze(ordered);
}

/**
 * Dependency relevance is intentionally binary at R3: a contradiction is
 * commercially relevant if and only if it lies on an active semantic dependency
 * path. Its magnitude remains TI's contradiction severity.
 *
 * x_relevant = x_TI * I(active_dependency_path)
 */
export function relevantContradictionUncertainty(tiSeverity: number, dependencyIsActive: boolean): number {
  return dependencyIsActive ? clamp01(tiSeverity) : 0;
}

function propagatedChannels(
  mode: GenesisT8DependencyMode,
  source: GenesisT8PropagatedConstraintState,
): Readonly<{
  support: number;
  limiting: number;
  boundaryElimination: number;
  boundarySurvival: number;
  contradiction: number;
  knowledgeDeficit: number;
}> {
  const common = {
    contradiction: relevantContradictionUncertainty(source.relevantContradictionUncertainty, true),
    knowledgeDeficit: source.effectiveKnowledgeDeficit,
  };
  switch (mode) {
    case "REQUIRED":
      return {
        ...common,
        support: 0,
        limiting: source.effectiveLimitingPressure,
        boundaryElimination: source.effectiveBoundaryEliminationSupport,
        boundarySurvival: source.effectiveBoundarySurvivalSupport,
      };
    case "LIMITING":
      return { ...common, support: 0, limiting: source.effectiveLimitingPressure, boundaryElimination: 0, boundarySurvival: 0 };
    case "SUPPORTING":
      return { ...common, support: source.effectiveSupportStrength, limiting: 0, boundaryElimination: 0, boundarySurvival: 0 };
    case "INFORMATIONAL":
      return { ...common, support: 0, limiting: 0, boundaryElimination: 0, boundarySurvival: 0 };
  }
}

/**
 * Idempotent lattice aggregation is deliberate:
 *   propagated_channel(target) = max(local_channel, incoming eligible channels)
 *
 * Duplicate paths therefore cannot manufacture extra force. R4 may introduce
 * mathematically justified reinforcement, but R3 never sums repeated structure.
 */
export function propagateConstraintStates(
  localStates: readonly GenesisT8ConstraintMathState[],
  dependencies: readonly GenesisT8ConstraintDependency[],
): GenesisT8CommercialRealityPropagation {
  const ids = new Set<string>();
  for (const state of localStates) {
    if (!state.constraintId?.trim()) throw new Error("GENESIS_T8_CE_R2_R3_VIOLATION:CONSTRAINT_ID");
    if (ids.has(state.constraintId)) throw new Error("GENESIS_T8_CE_R2_R3_VIOLATION:DUPLICATE_CONSTRAINT_ID");
    ids.add(state.constraintId);
  }
  const order = topologicalConstraintOrder(localStates, dependencies);
  const localById = new Map(localStates.map((state) => [state.constraintId, state]));
  const incomingByTarget = new Map<string, GenesisT8ConstraintDependency[]>();
  for (const dependency of dependencies) incomingByTarget.set(dependency.toConstraintId, [...(incomingByTarget.get(dependency.toConstraintId) ?? []), dependency]);

  const effective = new Map<string, GenesisT8PropagatedConstraintState>();
  for (const constraintId of order) {
    const local = localById.get(constraintId)!;
    let support = local.supportStrength;
    let limiting = local.limitingPressure;
    let boundaryElimination = local.boundaryEliminationSupport;
    let boundarySurvival = local.boundarySurvivalSupport;
    let contradiction = local.contradictionUncertainty;
    let knowledgeDeficit = local.knowledgeDeficit;
    const incoming = [...(incomingByTarget.get(constraintId) ?? [])].sort((a, b) => a.dependencyId.localeCompare(b.dependencyId));

    for (const dependency of incoming) {
      const source = effective.get(dependency.fromConstraintId)!;
      const propagated = propagatedChannels(dependency.mode, source);
      support = max(support, propagated.support);
      limiting = max(limiting, propagated.limiting);
      boundaryElimination = max(boundaryElimination, propagated.boundaryElimination);
      boundarySurvival = max(boundarySurvival, propagated.boundarySurvival);
      contradiction = max(contradiction, propagated.contradiction);
      knowledgeDeficit = max(knowledgeDeficit, propagated.knowledgeDeficit);
    }

    effective.set(constraintId, Object.freeze({
      constraintId,
      local,
      effectiveSupportStrength: support,
      effectiveLimitingPressure: limiting,
      effectiveBoundaryEliminationSupport: boundaryElimination,
      effectiveBoundarySurvivalSupport: boundarySurvival,
      relevantContradictionUncertainty: contradiction,
      effectiveKnowledgeDeficit: knowledgeDeficit,
      incomingDependencyIds: Object.freeze(incoming.map((dependency) => dependency.dependencyId)),
    }));
  }

  const eliminating: string[] = [];
  const unresolved: string[] = [];
  for (const state of effective.values()) {
    if (state.local.constraintClass !== "BOUNDARY") continue;
    const margin = state.effectiveBoundarySurvivalSupport - state.effectiveBoundaryEliminationSupport;
    const contradiction = state.relevantContradictionUncertainty;
    if (contradiction > 0 && contradiction >= Math.abs(margin)) {
      unresolved.push(state.constraintId);
    } else if (margin < 0) {
      eliminating.push(state.constraintId);
    } else if (margin === 0 && state.local.applicability !== "NOT_APPLICABLE") {
      unresolved.push(state.constraintId);
    }
  }

  const viability: GenesisT8CommercialRealityPropagation["viability"] = eliminating.length
    ? "ELIMINATED"
    : unresolved.length
      ? "UNRESOLVED"
      : "SURVIVES";

  return Object.freeze({
    orderedConstraintIds: order,
    states: Object.freeze(order.map((id) => effective.get(id)!)),
    viability,
    eliminatingConstraintIds: Object.freeze(eliminating.sort((a, b) => a.localeCompare(b))),
    unresolvedBoundaryConstraintIds: Object.freeze(unresolved.sort((a, b) => a.localeCompare(b))),
  });
}

export const GENESIS_T8_CONSTRAINT_PROPAGATION_LAWS = Object.freeze([
  "AI_OWNS_DEPENDENCY_SEMANTICS",
  "DEPENDENCIES_ARE_CATEGORICAL_NOT_NUMERIC_WEIGHTS",
  "REASONING_DEPENDENCY_GRAPH_IS_ACYCLIC_EVEN_WHEN_COMMERCIAL_GRAPH_CONTAINS_CYCLES",
  "PROPAGATION_PRESERVES_CHANNEL_CLASS",
  "REQUIRED_DEPENDENCIES_MAY_CASCADE_BOUNDARY_STATE",
  "LIMITING_DEPENDENCIES_MAY_PROPAGATE_LIMITING_PRESSURE_ONLY",
  "SUPPORTING_DEPENDENCIES_MAY_PROPAGATE_SUPPORT_ONLY",
  "INFORMATIONAL_DEPENDENCIES_PROPAGATE_UNCERTAINTY_NOT_VIABILITY_FORCE",
  "UNKNOWN_KNOWLEDGE_PROPAGATES_AS_KNOWLEDGE_DEFICIT_NOT_NEGATIVE_FIT",
  "TI_CONTRADICTION_IS_COMMERCIALLY_RELEVANT_ONLY_ON_AN_ACTIVE_DEPENDENCY_PATH",
  "TI_RETAINS_OWNERSHIP_OF_CONTRADICTION_MAGNITUDE",
  "MAX_LATTICE_AGGREGATION_PREVENTS_DUPLICATE_PATH_DOUBLE_COUNTING",
  "SUPPORTING_OR_LIMITING_FORCE_CAN_NEVER_OVERRIDE_A_VIOLATED_BOUNDARY",
  "BOUNDARY_DOMINANCE_IS_DETERMINISTIC_AND_CONTRADICTION_CAN_RENDER_IT_UNRESOLVED",
] as const);

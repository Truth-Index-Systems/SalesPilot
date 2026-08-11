/**
 * Genesis T8 CE2 Evolution R8 — Counterfactual Decision Calculus.
 *
 * Research-led additive evolution over frozen CE-R2 v1 and CE2 R1-R7.
 * R8 models deterministic commercial recourse as a finite intervention problem:
 *   1. define explicit target conditions;
 *   2. consume only explicit actionable interventions;
 *   3. enumerate successful intervention sets;
 *   4. retain subset-minimal successful sets;
 *   5. Pareto-order incomparable intervention burdens without scalar weights.
 *
 * R8 does NOT invent interventions, causal effects, utilities, probabilities,
 * action costs, or semantic relationships. Those must be supplied by governed
 * upstream boundaries. AI may canonicalise intervention semantics only.
 */

export const GENESIS_T8_CE2_EVOLUTION_R8_VERSION = "1.0.0" as const;
export const GENESIS_T8_CE2_EVOLUTION_R8_BUILD = "CE2-R8" as const;

export const GENESIS_T8_COUNTERFACTUAL_CONDITION_CLASSES = Object.freeze([
  "COMMERCIAL",
  "EPISTEMIC",
  "TEMPORAL",
  "GRAPH",
  "STABILITY",
] as const);
export type GenesisT8CounterfactualConditionClass = (typeof GENESIS_T8_COUNTERFACTUAL_CONDITION_CLASSES)[number];

export const GENESIS_T8_INTERVENTION_ACTIONABILITY = Object.freeze([
  "ACTIONABLE",
  "UNRESOLVED",
  "INADMISSIBLE",
] as const);
export type GenesisT8InterventionActionability = (typeof GENESIS_T8_INTERVENTION_ACTIONABILITY)[number];

export const GENESIS_T8_INTERVENTION_REVERSIBILITY = Object.freeze([
  "REVERSIBLE",
  "IRREVERSIBLE",
  "UNKNOWN",
] as const);
export type GenesisT8InterventionReversibility = (typeof GENESIS_T8_INTERVENTION_REVERSIBILITY)[number];

export type GenesisT8CounterfactualCondition = Readonly<{
  conditionId: string;
  conditionClass: GenesisT8CounterfactualConditionClass;
  currentSatisfied: boolean;
  targetRequired: boolean;
  referencedTokenIds: readonly string[];
}>;

/**
 * An intervention's effects are explicit governed claims, not predictions made
 * by this calculus. `satisfiesConditionIds` means the intervention is authorised
 * upstream to satisfy those target conditions if executed.
 */
export type GenesisT8CounterfactualIntervention = Readonly<{
  interventionId: string;
  semanticActionKey: string;
  actionability: GenesisT8InterventionActionability;
  reversibility: GenesisT8InterventionReversibility;
  satisfiesConditionIds: readonly string[];
  monetaryCostUsd: number | null;
  durationMs: number | null;
  referencedTokenIds: readonly string[];
  referencedRelationshipIds: readonly string[];
}>;

export type GenesisT8CounterfactualSearchLimits = Readonly<{
  /** Computational guard only. Exceeding it fails closed; results are not truncated. */
  maxCandidateInterventions: number;
  maxEvaluatedSubsets: number;
}>;

export type GenesisT8CounterfactualPlan = Readonly<{
  interventionIds: readonly string[];
  satisfiedConditionIds: readonly string[];
  actionCount: number;
  irreversibleActionCount: number;
  unknownReversibilityCount: number;
  totalKnownMonetaryCostUsd: number | null;
  totalKnownDurationMs: number | null;
  subsetMinimal: true;
  paretoEfficient: boolean;
  deterministicReasons: readonly string[];
}>;

export type GenesisT8CounterfactualAssessment = Readonly<{
  realityId: string;
  targetKey: string;
  baselineSatisfiesTarget: boolean;
  requiredUnsatisfiedConditionIds: readonly string[];
  actionableInterventionIds: readonly string[];
  unresolvedInterventionIds: readonly string[];
  inadmissibleInterventionIds: readonly string[];
  successfulPlanExists: boolean;
  subsetMinimalPlans: readonly GenesisT8CounterfactualPlan[];
  paretoPlans: readonly GenesisT8CounterfactualPlan[];
  deterministicReasons: readonly string[];
}>;

const canonicalId = (value: string, code: string): string => {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) throw new Error(`GENESIS_T8_CE2_R8_VIOLATION:${code}`);
  return value;
};

function uniqueSorted(values: readonly string[], code: string): readonly string[] {
  const copy = values.map((value) => canonicalId(value, code));
  if (new Set(copy).size !== copy.length) throw new Error(`GENESIS_T8_CE2_R8_VIOLATION:DUPLICATE_${code}`);
  return Object.freeze([...copy].sort((a, b) => a.localeCompare(b)));
}

export function assertCounterfactualConditionInvariant(condition: GenesisT8CounterfactualCondition): void {
  canonicalId(condition.conditionId, "CONDITION_ID");
  if (!(GENESIS_T8_COUNTERFACTUAL_CONDITION_CLASSES as readonly string[]).includes(condition.conditionClass)) throw new Error("GENESIS_T8_CE2_R8_VIOLATION:CONDITION_CLASS");
  if (typeof condition.currentSatisfied !== "boolean" || typeof condition.targetRequired !== "boolean") throw new Error("GENESIS_T8_CE2_R8_VIOLATION:CONDITION_BOOLEAN");
  uniqueSorted(condition.referencedTokenIds, "TOKEN_ID");
  for (const forbidden of ["score", "weight", "priority", "importance", "probability", "confidence", "utility", "rank"]) {
    if (Object.prototype.hasOwnProperty.call(condition as object, forbidden)) throw new Error(`GENESIS_T8_CE2_R8_VIOLATION:CONDITION_AUTHORITY_LEAK:${forbidden}`);
  }
}

export function assertCounterfactualInterventionInvariant(intervention: GenesisT8CounterfactualIntervention): void {
  canonicalId(intervention.interventionId, "INTERVENTION_ID");
  canonicalId(intervention.semanticActionKey, "SEMANTIC_ACTION_KEY");
  if (!(GENESIS_T8_INTERVENTION_ACTIONABILITY as readonly string[]).includes(intervention.actionability)) throw new Error("GENESIS_T8_CE2_R8_VIOLATION:ACTIONABILITY");
  if (!(GENESIS_T8_INTERVENTION_REVERSIBILITY as readonly string[]).includes(intervention.reversibility)) throw new Error("GENESIS_T8_CE2_R8_VIOLATION:REVERSIBILITY");
  uniqueSorted(intervention.satisfiesConditionIds, "SATISFIED_CONDITION_ID");
  uniqueSorted(intervention.referencedTokenIds, "TOKEN_ID");
  uniqueSorted(intervention.referencedRelationshipIds, "RELATIONSHIP_ID");
  if (intervention.monetaryCostUsd !== null && (!Number.isFinite(intervention.monetaryCostUsd) || intervention.monetaryCostUsd < 0)) throw new Error("GENESIS_T8_CE2_R8_VIOLATION:MONETARY_COST");
  if (intervention.durationMs !== null && (!Number.isInteger(intervention.durationMs) || intervention.durationMs < 0)) throw new Error("GENESIS_T8_CE2_R8_VIOLATION:DURATION");
  for (const forbidden of ["score", "weight", "priority", "importance", "probability", "confidence", "utility", "rank", "distance"] as const) {
    if (Object.prototype.hasOwnProperty.call(intervention as object, forbidden)) throw new Error(`GENESIS_T8_CE2_R8_VIOLATION:INTERVENTION_AUTHORITY_LEAK:${forbidden}`);
  }
}

export function assertCounterfactualSearchLimitsInvariant(limits: GenesisT8CounterfactualSearchLimits): void {
  if (!Number.isInteger(limits.maxCandidateInterventions) || limits.maxCandidateInterventions < 1) throw new Error("GENESIS_T8_CE2_R8_VIOLATION:MAX_CANDIDATE_INTERVENTIONS");
  if (!Number.isInteger(limits.maxEvaluatedSubsets) || limits.maxEvaluatedSubsets < 1) throw new Error("GENESIS_T8_CE2_R8_VIOLATION:MAX_EVALUATED_SUBSETS");
}

function isSubset(a: readonly string[], b: readonly string[]): boolean {
  const bSet = new Set(b);
  return a.every((value) => bSet.has(value));
}

function sumKnown(values: readonly (number | null)[]): number | null {
  if (values.some((value) => value === null)) return null;
  return values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

function compareKnownNoWorse(a: number | null, b: number | null): boolean | null {
  if (a === null || b === null) return null;
  return a <= b;
}

function planDominates(a: GenesisT8CounterfactualPlan, b: GenesisT8CounterfactualPlan): boolean {
  let strictlyBetter = false;
  const ordinalPairs: readonly [number, number][] = [
    [a.actionCount, b.actionCount],
    [a.irreversibleActionCount, b.irreversibleActionCount],
    [a.unknownReversibilityCount, b.unknownReversibilityCount],
  ];
  for (const [av, bv] of ordinalPairs) {
    if (av > bv) return false;
    if (av < bv) strictlyBetter = true;
  }
  const costNoWorse = compareKnownNoWorse(a.totalKnownMonetaryCostUsd, b.totalKnownMonetaryCostUsd);
  if (costNoWorse === false) return false;
  if (costNoWorse === true && a.totalKnownMonetaryCostUsd! < b.totalKnownMonetaryCostUsd!) strictlyBetter = true;
  const durationNoWorse = compareKnownNoWorse(a.totalKnownDurationMs, b.totalKnownDurationMs);
  if (durationNoWorse === false) return false;
  if (durationNoWorse === true && a.totalKnownDurationMs! < b.totalKnownDurationMs!) strictlyBetter = true;
  return strictlyBetter;
}

function buildPlan(interventions: readonly GenesisT8CounterfactualIntervention[]): GenesisT8CounterfactualPlan {
  const ordered = [...interventions].sort((a, b) => a.interventionId.localeCompare(b.interventionId));
  const interventionIds = Object.freeze(ordered.map((item) => item.interventionId));
  const satisfiedConditionIds = Object.freeze([...new Set(ordered.flatMap((item) => item.satisfiesConditionIds))].sort((a, b) => a.localeCompare(b)));
  const irreversibleActionCount = ordered.filter((item) => item.reversibility === "IRREVERSIBLE").length;
  const unknownReversibilityCount = ordered.filter((item) => item.reversibility === "UNKNOWN").length;
  const totalKnownMonetaryCostUsd = sumKnown(ordered.map((item) => item.monetaryCostUsd));
  const totalKnownDurationMs = sumKnown(ordered.map((item) => item.durationMs));
  return Object.freeze({
    interventionIds,
    satisfiedConditionIds,
    actionCount: ordered.length,
    irreversibleActionCount,
    unknownReversibilityCount,
    totalKnownMonetaryCostUsd,
    totalKnownDurationMs,
    subsetMinimal: true,
    paretoEfficient: false,
    deterministicReasons: Object.freeze([
      `ACTION_COUNT:${ordered.length}`,
      `IRREVERSIBLE_ACTION_COUNT:${irreversibleActionCount}`,
      `UNKNOWN_REVERSIBILITY_COUNT:${unknownReversibilityCount}`,
      `KNOWN_MONETARY_COST_USD:${totalKnownMonetaryCostUsd === null ? "UNKNOWN" : totalKnownMonetaryCostUsd}`,
      `KNOWN_DURATION_MS:${totalKnownDurationMs === null ? "UNKNOWN" : totalKnownDurationMs}`,
    ]),
  });
}

/**
 * Finds actionable subset-minimal recourse plans and their Pareto-efficient subset.
 * It never fabricates a causal effect: only explicit `satisfiesConditionIds` count.
 */
export function evaluateCounterfactualDecision(input: Readonly<{
  realityId: string;
  targetKey: string;
  conditions: readonly GenesisT8CounterfactualCondition[];
  interventions: readonly GenesisT8CounterfactualIntervention[];
  limits: GenesisT8CounterfactualSearchLimits;
}>): GenesisT8CounterfactualAssessment {
  const realityId = canonicalId(input.realityId, "REALITY_ID");
  const targetKey = canonicalId(input.targetKey, "TARGET_KEY");
  assertCounterfactualSearchLimitsInvariant(input.limits);
  if (!input.conditions.length) throw new Error("GENESIS_T8_CE2_R8_VIOLATION:EMPTY_CONDITIONS");
  const conditionIds = new Set<string>();
  for (const condition of input.conditions) {
    assertCounterfactualConditionInvariant(condition);
    if (conditionIds.has(condition.conditionId)) throw new Error("GENESIS_T8_CE2_R8_VIOLATION:DUPLICATE_CONDITION_ID");
    conditionIds.add(condition.conditionId);
  }
  const interventionIds = new Set<string>();
  for (const intervention of input.interventions) {
    assertCounterfactualInterventionInvariant(intervention);
    if (interventionIds.has(intervention.interventionId)) throw new Error("GENESIS_T8_CE2_R8_VIOLATION:DUPLICATE_INTERVENTION_ID");
    interventionIds.add(intervention.interventionId);
    for (const conditionId of intervention.satisfiesConditionIds) if (!conditionIds.has(conditionId)) throw new Error(`GENESIS_T8_CE2_R8_VIOLATION:INTERVENTION_CONDITION_MISSING:${conditionId}`);
  }

  const requiredUnsatisfiedConditionIds = Object.freeze(input.conditions
    .filter((condition) => condition.targetRequired && !condition.currentSatisfied)
    .map((condition) => condition.conditionId)
    .sort((a, b) => a.localeCompare(b)));
  const baselineSatisfiesTarget = requiredUnsatisfiedConditionIds.length === 0;

  const actionable = input.interventions.filter((item) => item.actionability === "ACTIONABLE").sort((a, b) => a.interventionId.localeCompare(b.interventionId));
  const unresolvedInterventionIds = Object.freeze(input.interventions.filter((item) => item.actionability === "UNRESOLVED").map((item) => item.interventionId).sort((a, b) => a.localeCompare(b)));
  const inadmissibleInterventionIds = Object.freeze(input.interventions.filter((item) => item.actionability === "INADMISSIBLE").map((item) => item.interventionId).sort((a, b) => a.localeCompare(b)));
  if (actionable.length > input.limits.maxCandidateInterventions) throw new Error("GENESIS_T8_CE2_R8_VIOLATION:CANDIDATE_LIMIT_EXCEEDED");

  if (baselineSatisfiesTarget) {
    return Object.freeze({ realityId, targetKey, baselineSatisfiesTarget: true, requiredUnsatisfiedConditionIds, actionableInterventionIds: Object.freeze(actionable.map((i) => i.interventionId)), unresolvedInterventionIds, inadmissibleInterventionIds, successfulPlanExists: true, subsetMinimalPlans: Object.freeze([]), paretoPlans: Object.freeze([]), deterministicReasons: Object.freeze(["BASELINE_ALREADY_SATISFIES_TARGET"]) });
  }

  const requiredSet = new Set(requiredUnsatisfiedConditionIds);
  const successes: GenesisT8CounterfactualPlan[] = [];
  const n = actionable.length;
  const totalSubsets = 2 ** n - 1;
  if (!Number.isSafeInteger(totalSubsets) || totalSubsets > input.limits.maxEvaluatedSubsets) throw new Error("GENESIS_T8_CE2_R8_VIOLATION:SUBSET_LIMIT_EXCEEDED");

  for (let mask = 1; mask <= totalSubsets; mask += 1) {
    const selected: GenesisT8CounterfactualIntervention[] = [];
    const covered = new Set<string>();
    for (let index = 0; index < n; index += 1) {
      if ((mask & (2 ** index)) !== 0) {
        const intervention = actionable[index];
        selected.push(intervention);
        for (const id of intervention.satisfiesConditionIds) covered.add(id);
      }
    }
    if ([...requiredSet].every((id) => covered.has(id))) successes.push(buildPlan(selected));
  }

  const subsetMinimal = successes.filter((candidate) => !successes.some((other) =>
    other.interventionIds.length < candidate.interventionIds.length && isSubset(other.interventionIds, candidate.interventionIds)));
  subsetMinimal.sort((a, b) => a.interventionIds.join("\u0000").localeCompare(b.interventionIds.join("\u0000")));
  const pareto = subsetMinimal.filter((candidate) => !subsetMinimal.some((other) => other !== candidate && planDominates(other, candidate)))
    .map((plan) => Object.freeze({ ...plan, paretoEfficient: true as const }));

  return Object.freeze({
    realityId,
    targetKey,
    baselineSatisfiesTarget,
    requiredUnsatisfiedConditionIds,
    actionableInterventionIds: Object.freeze(actionable.map((item) => item.interventionId)),
    unresolvedInterventionIds,
    inadmissibleInterventionIds,
    successfulPlanExists: subsetMinimal.length > 0,
    subsetMinimalPlans: Object.freeze(subsetMinimal),
    paretoPlans: Object.freeze(pareto),
    deterministicReasons: Object.freeze([
      `REQUIRED_UNSATISFIED_CONDITION_COUNT:${requiredUnsatisfiedConditionIds.length}`,
      `ACTIONABLE_INTERVENTION_COUNT:${actionable.length}`,
      `SUBSET_MINIMAL_PLAN_COUNT:${subsetMinimal.length}`,
      `PARETO_PLAN_COUNT:${pareto.length}`,
      `SUCCESSFUL_PLAN_EXISTS:${subsetMinimal.length > 0}`,
    ]),
  });
}

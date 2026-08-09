/**
 * Genesis T8 Platform Constitution v1.0
 *
 * CE Release 1 / Build 1
 *
 * This module is deliberately declarative. It defines the platform invariants
 * that future Genesis T8 engines must obey without changing any existing G8
 * runtime behaviour.
 */

export const GENESIS_T8_PLATFORM = "GENESIS_T8" as const;
export const GENESIS_T8_CONSTITUTION_VERSION = "1.0.0" as const;
export const GENESIS_T8_CE_RELEASE = "CE-R1" as const;
export const GENESIS_T8_CE_BUILD = "BUILD1" as const;

export type GenesisT8ResponsibilityOwner =
  | "AI"
  | "TRUTH_ENGINE"
  | "DETERMINISTIC_SYSTEM"
  | "REASONING_ENGINE"
  | "APPLICATION";

export type GenesisT8KnowledgeClass =
  | "DISCOVERED_KNOWLEDGE"
  | "TRUTH_QUALIFIED_KNOWLEDGE"
  | "DERIVED_REASONING";

export type GenesisT8EngineId =
  | "TRUTH"
  | "COMMERCIAL"
  | "CONTACT"
  | "ROUTE"
  | "OPPORTUNITY";

export type GenesisT8EngineContract = Readonly<{
  id: GenesisT8EngineId;
  responsibility: string;
  mayConsume: readonly GenesisT8KnowledgeClass[];
  mayPersistAuthoritatively: readonly GenesisT8KnowledgeClass[];
  forbiddenResponsibilities: readonly string[];
}>;

export const GENESIS_T8_ENGINE_CONTRACTS = Object.freeze({
  TRUTH: Object.freeze({
    id: "TRUTH",
    responsibility: "Qualify evidence-backed knowledge for truth, confidence, coverage, dependency, contradiction and freshness.",
    mayConsume: Object.freeze(["DISCOVERED_KNOWLEDGE"]),
    mayPersistAuthoritatively: Object.freeze(["TRUTH_QUALIFIED_KNOWLEDGE"]),
    forbiddenResponsibilities: Object.freeze([
      "commercial desirability",
      "contact suitability",
      "route quality",
      "opportunity priority",
    ]),
  }),
  COMMERCIAL: Object.freeze({
    id: "COMMERCIAL",
    responsibility: "Reason deterministically about commercial compatibility and viability from truth-qualified knowledge.",
    mayConsume: Object.freeze(["TRUTH_QUALIFIED_KNOWLEDGE"]),
    mayPersistAuthoritatively: Object.freeze([]),
    forbiddenResponsibilities: Object.freeze(["web research", "truth calculation", "contact discovery", "route discovery"]),
  }),
  CONTACT: Object.freeze({
    id: "CONTACT",
    responsibility: "Reason deterministically about contact suitability from truth-qualified contact knowledge and upstream commercial reasoning.",
    mayConsume: Object.freeze(["TRUTH_QUALIFIED_KNOWLEDGE", "DERIVED_REASONING"]),
    mayPersistAuthoritatively: Object.freeze([]),
    forbiddenResponsibilities: Object.freeze(["web research", "truth calculation", "route quality"]),
  }),
  ROUTE: Object.freeze({
    id: "ROUTE",
    responsibility: "Reason deterministically about route suitability from truth-qualified route knowledge and upstream reasoning.",
    mayConsume: Object.freeze(["TRUTH_QUALIFIED_KNOWLEDGE", "DERIVED_REASONING"]),
    mayPersistAuthoritatively: Object.freeze([]),
    forbiddenResponsibilities: Object.freeze(["web research", "truth calculation", "contact identity discovery"]),
  }),
  OPPORTUNITY: Object.freeze({
    id: "OPPORTUNITY",
    responsibility: "Aggregate independent reasoning-engine outputs into an explainable opportunity conclusion.",
    mayConsume: Object.freeze(["TRUTH_QUALIFIED_KNOWLEDGE", "DERIVED_REASONING"]),
    mayPersistAuthoritatively: Object.freeze([]),
    forbiddenResponsibilities: Object.freeze(["web research", "truth calculation", "semantic canonicalisation"]),
  }),
} satisfies Record<GenesisT8EngineId, GenesisT8EngineContract>);

export const GENESIS_T8_CONSTITUTIONAL_LAWS = Object.freeze([
  "AI_UNDERSTANDS_GENESIS_REASONS",
  "TRUTH_PRECEDES_REASONING",
  "KNOWLEDGE_PERSISTS_REASONING_RECALCULATES",
  "IDENTICAL_INPUTS_IDENTICAL_REASONING",
  "EVERY_CONCLUSION_EXPLAINABLE",
  "TOKENS_ARE_CANONICAL_REPRESENTATION",
  "APPLICATIONS_CONSUME_GENESIS_NOT_REVERSE",
  "ONE_ENGINE_ONE_RESPONSIBILITY",
  "FROZEN_KERNELS_CHANGE_ONLY_BY_EXPLICIT_VERSION",
  "REALITY_NOT_DESIRED_SCORE",
] as const);

export type GenesisT8ConstitutionalLaw = (typeof GENESIS_T8_CONSTITUTIONAL_LAWS)[number];

export const GENESIS_T8_RESPONSIBILITY_BOUNDARY = Object.freeze({
  AI: Object.freeze([
    "discover",
    "read",
    "interpret",
    "canonicalise",
    "identify",
    "classify",
    "propose relationships",
  ]),
  TRUTH_ENGINE: Object.freeze([
    "evidence mathematics",
    "truth probability",
    "truth confidence",
    "truth coverage",
    "evidence dependency",
    "truth contradiction",
    "freshness",
  ]),
  DETERMINISTIC_SYSTEM: Object.freeze([
    "hard invariants",
    "numeric bounds",
    "allowed enums",
    "identifier integrity",
    "duplicate fingerprints",
    "persistence",
    "state machines",
    "versioning",
  ]),
  REASONING_ENGINE: Object.freeze([
    "constraint evaluation",
    "deterministic domain reasoning",
    "derived conclusions",
    "explainability trace",
  ]),
  APPLICATION: Object.freeze([
    "presentation",
    "filtering",
    "user workflow",
    "unlock mechanics",
  ]),
} satisfies Record<GenesisT8ResponsibilityOwner, readonly string[]>);

/**
 * Runtime guard intended for every future Genesis T8 reasoning engine.
 * It prevents an engine contract from accepting raw AI/discovered knowledge.
 * The Truth Engine is the sole permitted exception.
 */
export function assertTruthPrecedesReasoning(contract: GenesisT8EngineContract): void {
  if (contract.id === "TRUTH") return;
  if (contract.mayConsume.includes("DISCOVERED_KNOWLEDGE")) {
    throw new Error(`GENESIS_T8_CONSTITUTION_VIOLATION:${contract.id}:TRUTH_MUST_PRECEDE_REASONING`);
  }
}

/**
 * Derived reasoning may be cached operationally, but may never be persisted as
 * authoritative knowledge. This guard protects that semantic distinction.
 */
export function assertNoAuthoritativeReasoningPersistence(contract: GenesisT8EngineContract): void {
  if (contract.mayPersistAuthoritatively.includes("DERIVED_REASONING")) {
    throw new Error(`GENESIS_T8_CONSTITUTION_VIOLATION:${contract.id}:DERIVED_REASONING_IS_NOT_KNOWLEDGE`);
  }
}

for (const contract of Object.values(GENESIS_T8_ENGINE_CONTRACTS)) {
  assertTruthPrecedesReasoning(contract);
  assertNoAuthoritativeReasoningPersistence(contract);
}

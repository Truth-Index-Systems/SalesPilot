/**
 * Genesis T8 Platform Constitution v1.1
 * CE Release 1 / Build 7 freeze candidate.
 */
export const GENESIS_T8_PLATFORM = "GENESIS_T8" as const;
export const GENESIS_T8_CONSTITUTION_VERSION = "1.1.0" as const;
export const GENESIS_T8_CE_RELEASE = "CE-R1" as const;
export const GENESIS_T8_CE_BUILD = "BUILD1" as const;

export type GenesisT8ResponsibilityOwner = "AI" | "TRUTH_ENGINE" | "DETERMINISTIC_SYSTEM" | "REASONING_ENGINE" | "APPLICATION";
export type GenesisT8KnowledgeClass = "DISCOVERED_KNOWLEDGE" | "TRUTH_QUALIFIED_KNOWLEDGE" | "DERIVED_REASONING";
export type GenesisT8CanonicalEngineId = "TRUTH" | "COMMERCIAL" | "CONTACT" | "ROUTE" | "OPPORTUNITY";
/** Extensible by registration; the Constitution does not require amendment for future engines. */
export type GenesisT8EngineId = string;

export type GenesisT8EngineContract = Readonly<{
  id: GenesisT8EngineId;
  responsibility: string;
  mayConsume: readonly GenesisT8KnowledgeClass[];
  mayPersistAuthoritatively: readonly GenesisT8KnowledgeClass[];
  consumesDerivedReasoningFrom: readonly GenesisT8EngineId[];
  forbiddenResponsibilities: readonly string[];
}>;

const engine = <T extends GenesisT8EngineContract>(value: T): T => Object.freeze(value);

export const GENESIS_T8_ENGINE_CONTRACTS = Object.freeze({
  TRUTH: engine({ id: "TRUTH", responsibility: "Qualify evidence-backed knowledge for truth, confidence, coverage, dependency, contradiction and freshness.", mayConsume: ["DISCOVERED_KNOWLEDGE"] as const, mayPersistAuthoritatively: ["TRUTH_QUALIFIED_KNOWLEDGE"] as const, consumesDerivedReasoningFrom: [] as const, forbiddenResponsibilities: ["commercial desirability", "contact suitability", "route quality", "opportunity priority"] as const }),
  COMMERCIAL: engine({ id: "COMMERCIAL", responsibility: "Reason deterministically about commercial compatibility and viability from truth-qualified canonical knowledge.", mayConsume: ["TRUTH_QUALIFIED_KNOWLEDGE"] as const, mayPersistAuthoritatively: [] as const, consumesDerivedReasoningFrom: [] as const, forbiddenResponsibilities: ["web research", "truth calculation", "contact discovery", "route discovery", "semantic interpretation"] as const }),
  CONTACT: engine({ id: "CONTACT", responsibility: "Reason deterministically about contact suitability from truth-qualified contact knowledge and authorised upstream commercial reasoning.", mayConsume: ["TRUTH_QUALIFIED_KNOWLEDGE", "DERIVED_REASONING"] as const, mayPersistAuthoritatively: [] as const, consumesDerivedReasoningFrom: ["COMMERCIAL"] as const, forbiddenResponsibilities: ["web research", "truth calculation", "route quality", "business fit calculation", "semantic interpretation"] as const }),
  ROUTE: engine({ id: "ROUTE", responsibility: "Reason deterministically about route suitability from truth-qualified route knowledge and authorised upstream reasoning.", mayConsume: ["TRUTH_QUALIFIED_KNOWLEDGE", "DERIVED_REASONING"] as const, mayPersistAuthoritatively: [] as const, consumesDerivedReasoningFrom: ["COMMERCIAL", "CONTACT"] as const, forbiddenResponsibilities: ["web research", "truth calculation", "contact identity discovery", "semantic interpretation"] as const }),
  OPPORTUNITY: engine({ id: "OPPORTUNITY", responsibility: "Aggregate authorised independent reasoning-engine outputs into an explainable opportunity conclusion.", mayConsume: ["TRUTH_QUALIFIED_KNOWLEDGE", "DERIVED_REASONING"] as const, mayPersistAuthoritatively: [] as const, consumesDerivedReasoningFrom: ["COMMERCIAL", "CONTACT", "ROUTE"] as const, forbiddenResponsibilities: ["web research", "truth calculation", "semantic canonicalisation"] as const }),
} satisfies Record<GenesisT8CanonicalEngineId, GenesisT8EngineContract>);

const engineRegistry = new Map<string, GenesisT8EngineContract>(Object.values(GENESIS_T8_ENGINE_CONTRACTS).map((contract) => [contract.id, contract]));

export function registerGenesisT8Engine(contract: GenesisT8EngineContract): void {
  if (!/^[A-Z][A-Z0-9_:-]{1,63}$/.test(contract.id)) throw new Error("GENESIS_T8_CONSTITUTION_VIOLATION:ENGINE_ID");
  if (engineRegistry.has(contract.id)) throw new Error(`GENESIS_T8_CONSTITUTION_VIOLATION:DUPLICATE_ENGINE:${contract.id}`);
  assertEngineContractInvariant(contract, new Set([...engineRegistry.keys(), contract.id]));
  engineRegistry.set(contract.id, Object.freeze({ ...contract, mayConsume: Object.freeze([...contract.mayConsume]), mayPersistAuthoritatively: Object.freeze([...contract.mayPersistAuthoritatively]), consumesDerivedReasoningFrom: Object.freeze([...contract.consumesDerivedReasoningFrom]), forbiddenResponsibilities: Object.freeze([...contract.forbiddenResponsibilities]) }));
}

export function getGenesisT8EngineContract(id: string): GenesisT8EngineContract | undefined { return engineRegistry.get(id); }

export const GENESIS_T8_CONSTITUTIONAL_LAWS = Object.freeze([
  "AI_UNDERSTANDS_GENESIS_REASONS",
  "SEMANTIC_SOVEREIGNTY_BELONGS_TO_AI",
  "TRUTH_PRECEDES_REASONING",
  "MATHEMATICAL_PURITY_CANONICAL_INPUTS_ONLY",
  "KNOWLEDGE_PERSISTS_REASONING_RECALCULATES",
  "IDENTICAL_INPUTS_IDENTICAL_REASONING",
  "EVERY_CONCLUSION_EXPLAINABLE",
  "TOKENS_ARE_CANONICAL_REPRESENTATION",
  "APPLICATIONS_CONSUME_GENESIS_NOT_REVERSE",
  "ONE_ENGINE_ONE_RESPONSIBILITY",
  "ENGINE_REGISTRY_IS_EXTENSIBLE_WITHOUT_CONSTITUTION_AMENDMENT",
  "FROZEN_KERNELS_CHANGE_ONLY_BY_EXPLICIT_VERSION",
  "REALITY_NOT_DESIRED_SCORE",
] as const);
export type GenesisT8ConstitutionalLaw = (typeof GENESIS_T8_CONSTITUTIONAL_LAWS)[number];

export const GENESIS_T8_RESPONSIBILITY_BOUNDARY = Object.freeze({
  AI: Object.freeze(["discover", "read", "interpret semantics", "canonicalise semantics", "entity resolution", "identify", "classify", "propose relationships"]),
  TRUTH_ENGINE: Object.freeze(["evidence mathematics", "truth probability", "truth confidence", "truth coverage", "evidence dependency", "truth contradiction", "freshness"]),
  DETERMINISTIC_SYSTEM: Object.freeze(["hard structural invariants", "numeric bounds", "allowed enums", "identifier integrity", "duplicate fingerprints", "persistence", "state machines", "versioning"]),
  REASONING_ENGINE: Object.freeze(["constraint evaluation", "deterministic domain reasoning", "derived conclusions", "explainability trace"]),
  APPLICATION: Object.freeze(["presentation", "filtering", "user workflow", "unlock mechanics"]),
} satisfies Record<GenesisT8ResponsibilityOwner, readonly string[]>);

export function assertTruthPrecedesReasoning(contract: GenesisT8EngineContract): void {
  if (contract.id === "TRUTH") return;
  if (contract.mayConsume.includes("DISCOVERED_KNOWLEDGE")) throw new Error(`GENESIS_T8_CONSTITUTION_VIOLATION:${contract.id}:TRUTH_MUST_PRECEDE_REASONING`);
}
export function assertNoAuthoritativeReasoningPersistence(contract: GenesisT8EngineContract): void {
  if (contract.mayPersistAuthoritatively.includes("DERIVED_REASONING")) throw new Error(`GENESIS_T8_CONSTITUTION_VIOLATION:${contract.id}:DERIVED_REASONING_IS_NOT_KNOWLEDGE`);
}
export function assertEngineContractInvariant(contract: GenesisT8EngineContract, knownIds = new Set(engineRegistry.keys())): void {
  assertTruthPrecedesReasoning(contract);
  assertNoAuthoritativeReasoningPersistence(contract);
  if (!contract.responsibility.trim()) throw new Error("GENESIS_T8_CONSTITUTION_VIOLATION:ENGINE_RESPONSIBILITY");
  if (!contract.mayConsume.includes("DERIVED_REASONING") && contract.consumesDerivedReasoningFrom.length) throw new Error("GENESIS_T8_CONSTITUTION_VIOLATION:DERIVED_PRODUCER_WITHOUT_DERIVED_INPUT");
  for (const upstream of contract.consumesDerivedReasoningFrom) {
    if (upstream === contract.id) throw new Error("GENESIS_T8_CONSTITUTION_VIOLATION:SELF_REASONING_DEPENDENCY");
    if (!knownIds.has(upstream)) throw new Error(`GENESIS_T8_CONSTITUTION_VIOLATION:UNKNOWN_UPSTREAM_ENGINE:${upstream}`);
  }
}

for (const contract of Object.values(GENESIS_T8_ENGINE_CONTRACTS)) assertEngineContractInvariant(contract, new Set(Object.keys(GENESIS_T8_ENGINE_CONTRACTS)));

/**
 * Genesis T8 AI Research Contract v1.0
 *
 * CE Release 1 / Build 6
 *
 * Defines the only contract by which AI may contribute candidate commercial
 * knowledge to the Genesis T8 Commercial Genome. AI discovers, extracts and
 * canonicalises evidence-backed candidate assertions. It never assigns truth,
 * fit, priority, recommendations, or authoritative graph state.
 */

import {
  GENESIS_T8_COMMERCIAL_GENOME_PREDICATES,
  predicateDefinitionFingerprint,
  type GenesisT8EvidenceExpectation,
  type GenesisT8GenomePredicateDefinition,
  type GenesisT8RefreshClass,
} from "./commercial-genome-ontology";
import type {
  GenesisT8CanonicalValueType,
  GenesisT8CommercialToken,
  GenesisT8TokenKind,
  GenesisT8TokenMutability,
} from "./token-theory";
import { GENESIS_T8_GRAPH_DIRECTIONS, GENESIS_T8_GRAPH_EDGE_CLASSES, type GenesisT8CommercialDimension, type GenesisT8GraphDirection, type GenesisT8GraphEdgeClass } from "./commercial-graph-9d";
import { assertCanonicalValue, assertTemporalInterval } from "./canonical-runtime";
import { assertRelationshipDefinition } from "./relationship-catalogue";

export const GENESIS_T8_AI_RESEARCH_CONTRACT_VERSION = "1.0.0" as const;
export const GENESIS_T8_CE_AI_RESEARCH_CONTRACT_BUILD = "BUILD6" as const;
export const GENESIS_T8_AI_RESEARCH_OUTPUT_SCHEMA = "genesis_t8_commercial_research_v1" as const;

export const GENESIS_T8_AI_RESEARCH_LAWS = Object.freeze([
  "AI_RESEARCHES_ONLY_CANONICAL_GENOME_PREDICATES",
  "AI_OUTPUT_IS_CANDIDATE_KNOWLEDGE_NOT_AUTHORITATIVE_KNOWLEDGE",
  "EVERY_ASSERTED_CANDIDATE_REQUIRES_EVIDENCE",
  "EVIDENCE_MUST_SUPPORT_THE_EXACT_ATOMIC_ASSERTION",
  "AI_MAY_EXTRACT_AND_CANONICALISE_BUT_MAY_NOT_ASSIGN_TRUTH",
  "AI_MAY_NOT_OUTPUT_PROBABILITY_CONFIDENCE_COVERAGE_OR_TI_FIELDS",
  "AI_MAY_NOT_OUTPUT_MATCH_FIT_PRIORITY_OPPORTUNITY_OR_RECOMMENDATION",
  "AI_MAY_NOT_TREAT_MISSING_KNOWLEDGE_AS_FALSE",
  "AI_MUST_DISTINGUISH_NOT_FOUND_FROM_CONTRADICTED",
  "AI_MUST_PRESERVE_SOURCE_PROVENANCE_AND_OBSERVATION_TIME",
  "AI_MUST_NOT_MERGE_DISTINCT_ATOMIC_ASSERTIONS_INTO_ONE_TOKEN",
  "AI_MUST_NOT_INVENT_ONTOLOGY_PREDICATES",
  "AI_MUST_NOT_WRITE_TRUTH_DIMENSION_PROJECTIONS",
  "AI_MAY_PROPOSE_NON_TRUTH_DIMENSION_COORDINATES_ONLY",
  "AI_MAY_PROPOSE_RELATIONSHIPS_BUT_RELATIONSHIPS_REMAIN_CANDIDATES",
  "AI_MUST_EXPOSE_AMBIGUITY_RATHER_THAN_RESOLVE_IT_BY_GUESSING",
  "CONFLICTING_CANDIDATES_MAY_COEXIST_FOR_TI_2_1_8_TO_RESOLVE",
  "TI_2_1_8_IS_THE_SOLE_AUTHORITY_FOR_TRUTH_QUALIFICATION",
  "DETERMINISTIC_CODE_HARD_VALIDATES_BEFORE_TI_QUALIFICATION",
  "RESEARCH_COMPLETION_DOES_NOT_MEAN_ALL_PREDICATES_ARE_KNOWN",
] as const);

export type GenesisT8AIResearchLaw = (typeof GENESIS_T8_AI_RESEARCH_LAWS)[number];

export type GenesisT8ResearchEvidenceRole =
  | "PRIMARY"
  | "CORROBORATING"
  | "CONTRADICTING"
  | "CONTEXT_ONLY";

export type GenesisT8ResearchSourceClass =
  | "OFFICIAL_COMPANY"
  | "GOVERNMENT_REGISTRY"
  | "REGULATOR"
  | "FINANCIAL_FILING"
  | "PROCUREMENT_PORTAL"
  | "JOB_POSTING"
  | "PARTNER_VENDOR"
  | "REPUTABLE_NEWS"
  | "INDUSTRY_PUBLICATION"
  | "OTHER_PUBLIC_WEB";

/**
 * Evidence is a captured source observation, not a truth score. `excerpt`
 * should contain the smallest useful passage supporting or contradicting the
 * atomic assertion. It remains input to TI rather than a conclusion from AI.
 */
export type GenesisT8AIResearchEvidence = Readonly<{
  evidenceId: string;
  sourceUrl: string;
  sourceClass: GenesisT8ResearchSourceClass;
  sourceTitle?: string;
  publisher?: string;
  observedAt: string;
  publishedAt?: string;
  excerpt: string;
  role: GenesisT8ResearchEvidenceRole;
}>;

export type GenesisT8CandidateDisposition =
  | "ASSERTED"
  | "CONTRADICTED"
  | "AMBIGUOUS"
  | "NOT_FOUND";

export type GenesisT8AIResearchCandidateToken = Readonly<{
  candidateId: string;
  subjectEntityId: string;
  predicate: string;
  disposition: GenesisT8CandidateDisposition;
  /** Null is permitted only for NOT_FOUND or AMBIGUOUS observations. */
  value: unknown | null;
  /** Canonical serialisation of value. Empty only when no assertion is made. */
  canonicalValue: string;
  valueType: GenesisT8CanonicalValueType;
  kind: GenesisT8TokenKind;
  validFrom?: string;
  validTo?: string;
  observedAt: string;
  evidenceIds: readonly string[];
  /** Non-truth projections proposed against the Build 3 dimensional vocabulary. */
  proposedDimensions: readonly Exclude<GenesisT8CommercialDimension, "TRUTH">[];
  /** Human-readable ambiguity only; never a hidden score or recommendation. */
  ambiguityNote?: string;
}>;

export type GenesisT8AIResearchCandidateRelation = Readonly<{
  candidateRelationId: string;
  fromCandidateId: string;
  toCandidateId: string;
  edgeClass: GenesisT8GraphEdgeClass;
  relationType: string;
  direction: GenesisT8GraphDirection;
  evidenceIds: readonly string[];
}>;

export type GenesisT8AIResearchPredicateResult = Readonly<{
  predicate: string;
  disposition: "ASSERTED" | "CONTRADICTED" | "AMBIGUOUS" | "NOT_FOUND" | "NOT_RESEARCHED";
  candidateIds: readonly string[];
  note?: string;
}>;

/**
 * One AI research envelope is intentionally provider-neutral and contains no
 * TI output. It can be hard-validated before anything enters the truth engine.
 */
export type GenesisT8AIResearchEnvelope = Readonly<{
  schema: typeof GENESIS_T8_AI_RESEARCH_OUTPUT_SCHEMA;
  contractVersion: typeof GENESIS_T8_AI_RESEARCH_CONTRACT_VERSION;
  researchRunId: string;
  subjectEntityId: string;
  requestedPredicates: readonly string[];
  evidence: readonly GenesisT8AIResearchEvidence[];
  candidates: readonly GenesisT8AIResearchCandidateToken[];
  relations: readonly GenesisT8AIResearchCandidateRelation[];
  predicateResults: readonly GenesisT8AIResearchPredicateResult[];
}>;

export type GenesisT8PredicateResearchDirective = Readonly<{
  predicate: string;
  label: string;
  meaning: string;
  kind: GenesisT8TokenKind;
  valueType: GenesisT8CanonicalValueType;
  mutability: GenesisT8TokenMutability;
  refreshClass: GenesisT8RefreshClass;
  evidenceExpectation: GenesisT8EvidenceExpectation;
  allowedDimensions: readonly Exclude<GenesisT8CommercialDimension, "TRUTH">[];
  instruction: string;
}>;

const ONTOLOGY_BY_PREDICATE = new Map<string, GenesisT8GenomePredicateDefinition>(
  GENESIS_T8_COMMERCIAL_GENOME_PREDICATES.map((definition) => [definition.predicate, definition]),
);

export function getCommercialGenomePredicate(
  predicate: string,
): GenesisT8GenomePredicateDefinition | undefined {
  return ONTOLOGY_BY_PREDICATE.get(predicate);
}

/**
 * Deterministically translates ontology definitions into AI-facing research
 * directives. The ontology, not a prompt author, decides value type, atomic
 * meaning, mutability, evidence expectation and dimensional scope.
 */
export function buildAIResearchDirectives(
  predicates: readonly string[],
): readonly GenesisT8PredicateResearchDirective[] {
  const unique = [...new Set(predicates)].sort((a, b) => a.localeCompare(b));
  return Object.freeze(unique.map((predicate) => {
    const definition = ONTOLOGY_BY_PREDICATE.get(predicate);
    if (!definition) {
      throw new Error(`GENESIS_T8_AI_RESEARCH_VIOLATION:UNKNOWN_PREDICATE:${predicate}`);
    }
    const allowedDimensions = definition.dimensions.filter(
      (dimension): dimension is Exclude<GenesisT8CommercialDimension, "TRUTH"> => dimension !== "TRUTH",
    );
    return Object.freeze({
      predicate: definition.predicate,
      label: definition.label,
      meaning: definition.meaning,
      kind: definition.kind,
      valueType: definition.valueType,
      mutability: definition.mutability,
      refreshClass: definition.refreshClass,
      evidenceExpectation: definition.evidenceExpectation,
      allowedDimensions: Object.freeze(allowedDimensions),
      instruction: `Find public evidence for the atomic fact '${definition.meaning}' and emit only the canonical value required by ${definition.valueType}. Do not score, rank, recommend, or assign truth.`,
    });
  }));
}

const isIsoDateTime = (value: string): boolean => Number.isFinite(Date.parse(value));

const GENESIS_T8_FORBIDDEN_AI_INFERENCE_TERMS = Object.freeze([
  "truth",
  "probability",
  "confidence",
  "coverage",
  "match",
  "fit",
  "score",
  "priority",
  "opportunity",
  "recommendation",
  "ranking",
] as const);

function assertNoForbiddenInferenceKeys(value: unknown, path = "root"): void {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
    if (GENESIS_T8_FORBIDDEN_AI_INFERENCE_TERMS.some((term) => normalizedKey.includes(term))) {
      throw new Error(`GENESIS_T8_AI_RESEARCH_VIOLATION:FORBIDDEN_FIELD:${path}.${key}`);
    }
    assertNoForbiddenInferenceKeys(child, `${path}.${key}`);
  }
}

export function assertAIResearchEvidenceInvariant(evidence: GenesisT8AIResearchEvidence): void {
  if (!evidence.evidenceId.trim()) throw new Error("GENESIS_T8_AI_RESEARCH_VIOLATION:EVIDENCE_ID_REQUIRED");
  if (!/^https?:\/\//i.test(evidence.sourceUrl)) throw new Error("GENESIS_T8_AI_RESEARCH_VIOLATION:EVIDENCE_URL_REQUIRED");
  if (!evidence.excerpt.trim()) throw new Error("GENESIS_T8_AI_RESEARCH_VIOLATION:EVIDENCE_EXCERPT_REQUIRED");
  if (!isIsoDateTime(evidence.observedAt)) throw new Error("GENESIS_T8_AI_RESEARCH_VIOLATION:EVIDENCE_OBSERVED_AT");
  if (evidence.publishedAt && !isIsoDateTime(evidence.publishedAt)) {
    throw new Error("GENESIS_T8_AI_RESEARCH_VIOLATION:EVIDENCE_PUBLISHED_AT");
  }
}

export function assertAIResearchCandidateInvariant(
  candidate: GenesisT8AIResearchCandidateToken,
  envelopeSubjectEntityId?: string,
): void {
  if (!candidate.candidateId.trim()) throw new Error("GENESIS_T8_AI_RESEARCH_VIOLATION:CANDIDATE_ID_REQUIRED");
  if (!candidate.subjectEntityId.trim()) throw new Error("GENESIS_T8_AI_RESEARCH_VIOLATION:SUBJECT_REQUIRED");
  if (!/^gen:[a-z0-9][a-z0-9:_-]{5,}$/i.test(candidate.subjectEntityId)) throw new Error("GENESIS_T8_AI_RESEARCH_VIOLATION:GLOBAL_SUBJECT_ID_REQUIRED");
  if (envelopeSubjectEntityId && candidate.subjectEntityId !== envelopeSubjectEntityId) {
    throw new Error("GENESIS_T8_AI_RESEARCH_VIOLATION:SUBJECT_MISMATCH");
  }
  const definition = ONTOLOGY_BY_PREDICATE.get(candidate.predicate);
  if (!definition) throw new Error("GENESIS_T8_AI_RESEARCH_VIOLATION:UNKNOWN_PREDICATE");
  if (candidate.kind !== definition.kind || candidate.valueType !== definition.valueType) {
    throw new Error("GENESIS_T8_AI_RESEARCH_VIOLATION:ONTOLOGY_TYPE_MISMATCH");
  }
  if (!isIsoDateTime(candidate.observedAt)) throw new Error("GENESIS_T8_AI_RESEARCH_VIOLATION:CANDIDATE_OBSERVED_AT");
  assertTemporalInterval(candidate.validFrom, candidate.validTo);
  if (!["ASSERTED", "CONTRADICTED", "AMBIGUOUS", "NOT_FOUND"].includes(candidate.disposition)) throw new Error("GENESIS_T8_AI_RESEARCH_VIOLATION:DISPOSITION");

  const makesAssertion = candidate.disposition === "ASSERTED" || candidate.disposition === "CONTRADICTED";
  if (makesAssertion) {
    if (candidate.value === null || !candidate.canonicalValue.trim()) {
      throw new Error("GENESIS_T8_AI_RESEARCH_VIOLATION:ASSERTION_VALUE_REQUIRED");
    }
    if (!candidate.evidenceIds.length) {
      throw new Error("GENESIS_T8_AI_RESEARCH_VIOLATION:ASSERTION_EVIDENCE_REQUIRED");
    }
    assertCanonicalValue(candidate.valueType, candidate.value, candidate.canonicalValue);
  } else if (candidate.disposition === "NOT_FOUND") {
    if (candidate.value !== null || candidate.canonicalValue !== "") {
      throw new Error("GENESIS_T8_AI_RESEARCH_VIOLATION:NOT_FOUND_MUST_NOT_ASSERT_VALUE");
    }
  } else if (candidate.disposition === "AMBIGUOUS" && !candidate.ambiguityNote?.trim()) {
    throw new Error("GENESIS_T8_AI_RESEARCH_VIOLATION:AMBIGUITY_NOTE_REQUIRED");
  }

  if (candidate.proposedDimensions.includes("TRUTH" as never)) {
    throw new Error("GENESIS_T8_AI_RESEARCH_VIOLATION:AI_TRUTH_PROJECTION_FORBIDDEN");
  }
  const allowed = new Set(definition.dimensions.filter((dimension) => dimension !== "TRUTH"));
  for (const dimension of candidate.proposedDimensions) {
    if (!allowed.has(dimension)) {
      throw new Error("GENESIS_T8_AI_RESEARCH_VIOLATION:DIMENSION_NOT_ALLOWED_BY_ONTOLOGY");
    }
  }
  assertNoForbiddenInferenceKeys(candidate);
}

export function assertAIResearchEnvelopeInvariant(envelope: GenesisT8AIResearchEnvelope): void {
  if (envelope.schema !== GENESIS_T8_AI_RESEARCH_OUTPUT_SCHEMA) {
    throw new Error("GENESIS_T8_AI_RESEARCH_VIOLATION:SCHEMA");
  }
  if (envelope.contractVersion !== GENESIS_T8_AI_RESEARCH_CONTRACT_VERSION) {
    throw new Error("GENESIS_T8_AI_RESEARCH_VIOLATION:CONTRACT_VERSION");
  }
  if (!envelope.researchRunId.trim() || !envelope.subjectEntityId.trim()) {
    throw new Error("GENESIS_T8_AI_RESEARCH_VIOLATION:RUN_OR_SUBJECT_REQUIRED");
  }

  const requested = new Set(envelope.requestedPredicates);
  if (requested.size !== envelope.requestedPredicates.length) {
    throw new Error("GENESIS_T8_AI_RESEARCH_VIOLATION:DUPLICATE_REQUESTED_PREDICATE");
  }
  for (const predicate of requested) {
    if (!ONTOLOGY_BY_PREDICATE.has(predicate)) {
      throw new Error("GENESIS_T8_AI_RESEARCH_VIOLATION:UNKNOWN_REQUESTED_PREDICATE");
    }
  }

  const evidenceIds = new Set<string>();
  for (const evidence of envelope.evidence) {
    assertAIResearchEvidenceInvariant(evidence);
    if (evidenceIds.has(evidence.evidenceId)) throw new Error("GENESIS_T8_AI_RESEARCH_VIOLATION:DUPLICATE_EVIDENCE_ID");
    evidenceIds.add(evidence.evidenceId);
  }

  const candidateIds = new Set<string>();
  for (const candidate of envelope.candidates) {
    assertAIResearchCandidateInvariant(candidate, envelope.subjectEntityId);
    if (!requested.has(candidate.predicate)) throw new Error("GENESIS_T8_AI_RESEARCH_VIOLATION:UNREQUESTED_PREDICATE");
    if (candidateIds.has(candidate.candidateId)) throw new Error("GENESIS_T8_AI_RESEARCH_VIOLATION:DUPLICATE_CANDIDATE_ID");
    candidateIds.add(candidate.candidateId);
    for (const evidenceId of candidate.evidenceIds) {
      if (!evidenceIds.has(evidenceId)) throw new Error("GENESIS_T8_AI_RESEARCH_VIOLATION:CANDIDATE_EVIDENCE_MISSING");
    }
  }

  const relationIds = new Set<string>();
  for (const relation of envelope.relations) {
    if (!relation.candidateRelationId.trim() || !relation.relationType.trim()) {
      throw new Error("GENESIS_T8_AI_RESEARCH_VIOLATION:RELATION_ID_OR_TYPE_REQUIRED");
    }
    if (relationIds.has(relation.candidateRelationId)) throw new Error("GENESIS_T8_AI_RESEARCH_VIOLATION:DUPLICATE_RELATION_ID");
    relationIds.add(relation.candidateRelationId);
    if (!GENESIS_T8_GRAPH_EDGE_CLASSES.includes(relation.edgeClass)) throw new Error("GENESIS_T8_AI_RESEARCH_VIOLATION:RELATION_EDGE_CLASS");
    if (!GENESIS_T8_GRAPH_DIRECTIONS.includes(relation.direction)) throw new Error("GENESIS_T8_AI_RESEARCH_VIOLATION:RELATION_DIRECTION");
    assertRelationshipDefinition(relation.relationType, relation.edgeClass, relation.direction);
    if (!candidateIds.has(relation.fromCandidateId) || !candidateIds.has(relation.toCandidateId)) {
      throw new Error("GENESIS_T8_AI_RESEARCH_VIOLATION:RELATION_CANDIDATE_MISSING");
    }
    if (relation.fromCandidateId === relation.toCandidateId) {
      throw new Error("GENESIS_T8_AI_RESEARCH_VIOLATION:SELF_RELATION_FORBIDDEN");
    }
    if (!relation.evidenceIds.length || relation.evidenceIds.some((id) => !evidenceIds.has(id))) {
      throw new Error("GENESIS_T8_AI_RESEARCH_VIOLATION:RELATION_EVIDENCE_REQUIRED");
    }
  }

  const resultPredicates = new Set<string>();
  for (const result of envelope.predicateResults) {
    if (!requested.has(result.predicate)) throw new Error("GENESIS_T8_AI_RESEARCH_VIOLATION:RESULT_UNREQUESTED_PREDICATE");
    if (resultPredicates.has(result.predicate)) throw new Error("GENESIS_T8_AI_RESEARCH_VIOLATION:DUPLICATE_PREDICATE_RESULT");
    resultPredicates.add(result.predicate);
    for (const candidateId of result.candidateIds) {
      if (!candidateIds.has(candidateId)) throw new Error("GENESIS_T8_AI_RESEARCH_VIOLATION:RESULT_CANDIDATE_MISSING");
    }
    const resultCandidates = envelope.candidates.filter((candidate) => result.candidateIds.includes(candidate.candidateId));
    if (resultCandidates.some((candidate) => candidate.predicate !== result.predicate)) {
      throw new Error("GENESIS_T8_AI_RESEARCH_VIOLATION:RESULT_CANDIDATE_PREDICATE_MISMATCH");
    }
  }
  if (resultPredicates.size !== requested.size) {
    throw new Error("GENESIS_T8_AI_RESEARCH_VIOLATION:EVERY_REQUESTED_PREDICATE_NEEDS_RESULT");
  }

  assertNoForbiddenInferenceKeys(envelope);
}

/** Branded only after the complete envelope and cross-reference validation succeeds. */
declare const GENESIS_T8_VALIDATED_AI_ENVELOPE: unique symbol;
export type GenesisT8ValidatedAIResearchEnvelope = GenesisT8AIResearchEnvelope & Readonly<{ [GENESIS_T8_VALIDATED_AI_ENVELOPE]: true }>;
const VALIDATED_ENVELOPES = new WeakSet<object>();

export function validateAIResearchEnvelope(envelope: GenesisT8AIResearchEnvelope): GenesisT8ValidatedAIResearchEnvelope {
  assertAIResearchEnvelopeInvariant(envelope);
  VALIDATED_ENVELOPES.add(envelope as object);
  return envelope as GenesisT8ValidatedAIResearchEnvelope;
}

/**
 * The only AI candidate -> DISCOVERED token adapter. A raw candidate cannot
 * cross this boundary; its complete envelope must first earn validation.
 */
export function candidateToDiscoveredToken(
  envelope: GenesisT8ValidatedAIResearchEnvelope,
  candidateId: string,
  allocatedTokenId: string,
): GenesisT8CommercialToken {
  if (!VALIDATED_ENVELOPES.has(envelope as object)) throw new Error("GENESIS_T8_AI_RESEARCH_VIOLATION:ENVELOPE_NOT_VALIDATED");
  if (!/^gt8:tok:[a-z0-9:_-]+$/i.test(allocatedTokenId)) throw new Error("GENESIS_T8_AI_RESEARCH_VIOLATION:ALLOCATED_TOKEN_ID_REQUIRED");
  const candidate = envelope.candidates.find((item) => item.candidateId === candidateId);
  if (!candidate) throw new Error("GENESIS_T8_AI_RESEARCH_VIOLATION:CANDIDATE_NOT_IN_VALIDATED_ENVELOPE");
  if (candidate.disposition !== "ASSERTED" && candidate.disposition !== "CONTRADICTED") throw new Error("GENESIS_T8_AI_RESEARCH_VIOLATION:NON_ASSERTION_CANNOT_BECOME_TOKEN");
  const definition = ONTOLOGY_BY_PREDICATE.get(candidate.predicate)!;
  return Object.freeze({
    tokenId: allocatedTokenId,
    subjectEntityId: candidate.subjectEntityId,
    predicate: candidate.predicate,
    predicateDefinitionFingerprint: predicateDefinitionFingerprint(definition),
    kind: definition.kind,
    valueType: definition.valueType,
    value: candidate.value,
    canonicalValue: candidate.canonicalValue,
    mutability: definition.mutability,
    lifecycle: "DISCOVERED" as const,
    validFrom: candidate.validFrom,
    validTo: candidate.validTo,
    observedAt: candidate.observedAt,
    provenance: Object.freeze({ evidenceIds: Object.freeze([...candidate.evidenceIds]), discoveredBy: "AI" as const, discoveryRunId: envelope.researchRunId }),
  });
}

/**
 * MarketRoute Forensic Build 3 — live Commercial Reality producer with material authority lineage.
 *
 * This is the first production composition boundary that connects the repaired
 * Truth Foundation + immutable seller constraints to CE-R2/R3/R4. It consumes
 * no legacy opportunity/fit/route/contact score and invents no truth threshold.
 */
import type { MrTi2ClaimContribution, MrTi2EntityTruthResult } from "../../genesis-g8/truth-v2/entity";
import { evaluateLocalConstraint, type GenesisT8ConstraintMathInput, type GenesisT8TIConstraintTruth } from "../mathematics/constraint-mathematics";
import { propagateConstraintStates, type GenesisT8CommercialRealityPropagation } from "../mathematics/constraint-propagation";
import { evaluateCommercialCoherence, type GenesisT8CoherenceConstraintContext, type GenesisT8CoherenceDimension } from "../mathematics/commercial-coherence";
import { composeTruthIntoCommercialReality, type CieR3KnowledgeInput, type CieR3CompositionResult } from "./truth-ce2-bridge";
import { evaluateCieR4CommercialDecision, type CieR4CommercialDecision } from "./commercial-decision-authority";
import { buildR4MaterialAuthorityFingerprint } from "./authority-lineage";

export const MARKETROUTE_FORENSIC_BUILD2_PRODUCER_VERSION = "MR-T8-FB3-1.0.0" as const;
export const MARKETROUTE_FORENSIC_BUILD2_TRUTH_SEMANTICS = "MR-TI-2-TFR1" as const;

const COHERENCE_DIMENSIONS = new Set<GenesisT8CoherenceDimension>([
  "SEMANTIC", "STRUCTURAL", "OPERATIONAL", "COMMERCIAL", "TECHNOLOGICAL", "STRATEGIC",
]);

export type ForensicBuild2SellerConstraint = Readonly<{
  constraintId: string;
  semanticDependencyKey: string;
  sourceValues: readonly string[];
  relevantDimensions: readonly string[];
}>;

export type ForensicBuild2SellerContext = Readonly<{
  sellerEntityId: string;
  selectedCommercialObjectiveId: string;
  sellerContextFingerprint: string;
  constraintFingerprint: string;
  boundaryConstraints: readonly ForensicBuild2SellerConstraint[];
  limitingConstraints: readonly ForensicBuild2SellerConstraint[];
}>;

export type ForensicBuild2TargetFacts = Readonly<{
  companyId: string;
  companyName: string | null;
  canonicalDomain: string | null;
  industry: string | null;
  country: string | null;
}>;

export type ForensicBuild2ProductionInput = Readonly<{
  opportunityId: string;
  targetTruthEntityId: string;
  targetTruthSnapshotId: string;
  targetTruth: MrTi2EntityTruthResult;
  seller: ForensicBuild2SellerContext;
  targetFacts: ForensicBuild2TargetFacts;
  referenceTime: string;
}>;

export type ForensicBuild2CommercialRealityProduction = Readonly<{
  producerVersion: typeof MARKETROUTE_FORENSIC_BUILD2_PRODUCER_VERSION;
  inputFingerprint: string;
  authorityFingerprint: string;
  sellerContextFingerprint: string;
  constraintFingerprint: string;
  targetTruthEntityId: string;
  targetTruthSnapshotId: string;
  targetTruthSemanticsVersion: string;
  targetCommercialEntityId: string;
  referenceTime: string;
  localConstraints: readonly ReturnType<typeof evaluateLocalConstraint>[];
  propagation: GenesisT8CommercialRealityPropagation;
  constraintContexts: readonly GenesisT8CoherenceConstraintContext[];
  composition: CieR3CompositionResult;
  decision: CieR4CommercialDecision;
  deferredSellerConstraintIds: readonly string[];
}>;

function canonical(value: string, code: string): string {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) throw new Error(`MR_FB2_INVALID:${code}`);
  return value;
}

function hash(value: unknown): string {
  const text=JSON.stringify(value);
  const prime=0x100000001b3n, mask=0xffffffffffffffffn;
  const seeds=[0xcbf29ce484222325n,0x84222325cbf29cen,0x9e3779b97f4a7c15n,0xd6e8feb86659fd93n];
  return seeds.map((seed)=>{
    let h=seed;
    for(let i=0;i<text.length;i+=1){h^=BigInt(text.charCodeAt(i));h=(h*prime)&mask;}
    return h.toString(16).padStart(16,"0");
  }).join("");
}

function normalise(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normaliseGeography(value: string | null | undefined): string {
  const n = normalise(value);
  const aliases: Readonly<Record<string, string>> = Object.freeze({
    uk: "united kingdom", "u k": "united kingdom", gb: "united kingdom", "great britain": "united kingdom", england: "united kingdom",
    us: "united states", "u s": "united states", usa: "united states", "u s a": "united states", america: "united states",
  });
  return aliases[n] ?? n;
}

function contribution(result: MrTi2EntityTruthResult, claimKey: string): MrTi2ClaimContribution | null {
  return result.diagnostics.contributions.find((item) => item.claimKey === claimKey) ?? null;
}

function truthChannels(item: MrTi2ClaimContribution | null): GenesisT8TIConstraintTruth | null {
  if (!item?.represented) return null;
  return Object.freeze({
    supportStrength: item.supportStrength,
    contradictionStrength: item.contradictionStrength,
    evidenceSufficiency: item.evidenceSufficiency,
    coverage: 1,
    contradictionSeverity: item.directContradictionSeverity,
  });
}

const SELLER_CANONICAL_TRUTH: GenesisT8TIConstraintTruth = Object.freeze({
  supportStrength: 1,
  contradictionStrength: 0,
  evidenceSufficiency: 1,
  coverage: 1,
  contradictionSeverity: 0,
});

function dimensions(values: readonly string[], fallback: readonly GenesisT8CoherenceDimension[]): readonly GenesisT8CoherenceDimension[] {
  const filtered = [...new Set(values.filter((value): value is GenesisT8CoherenceDimension => COHERENCE_DIMENSIONS.has(value as GenesisT8CoherenceDimension)))];
  return Object.freeze(filtered.length ? filtered.sort() : [...fallback]);
}

function targetKnowledge(targetEntityId: string, claimKey: string, item: MrTi2ClaimContribution | null, referenceTime: string): CieR3KnowledgeInput {
  const knowledgeId = `mrti2:${targetEntityId}:${claimKey}`;
  if (!item?.represented) return Object.freeze({
    knowledgeId,
    evidence: Object.freeze([]),
    truthQualification: "UNKNOWN" as const,
    contradictionQualified: false,
    presence: "MISSING" as const,
    interval: Object.freeze({ validFrom: null, validTo: null }),
  });
  const evidence = [] as Array<{ evidenceKey: string; direction: "SUPPORT" | "CONTRADICT"; effectiveStrength: number; dependenceFamilyKey: string }>;
  if (item.supportStrength > 0) evidence.push({ evidenceKey: `${knowledgeId}:support`, direction: "SUPPORT", effectiveStrength: item.supportStrength, dependenceFamilyKey: `${knowledgeId}:support-family` });
  if (item.contradictionStrength > 0) evidence.push({ evidenceKey: `${knowledgeId}:contradict`, direction: "CONTRADICT", effectiveStrength: item.contradictionStrength, dependenceFamilyKey: `${knowledgeId}:contradict-family` });
  return Object.freeze({
    knowledgeId,
    evidence: Object.freeze(evidence),
    // TFR1 is intentionally uncalibrated. Presence of evidence is not promoted to KNOWN.
    truthQualification: "UNCERTAIN" as const,
    // Relationship-derived AI numeric strength is not permitted to qualify live R4 contradiction.
    contradictionQualified: item.directReviewState === "HUMAN_REVIEW_REQUIRED",
    presence: "PRESENT" as const,
    interval: Object.freeze({ validFrom: null, validTo: null }),
  });
}

function sellerKnowledge(sellerEntityId: string, key: string): CieR3KnowledgeInput {
  const knowledgeId = `seller:${sellerEntityId}:${key}`;
  return Object.freeze({
    knowledgeId,
    evidence: Object.freeze([{ evidenceKey: `${knowledgeId}:canonical`, direction: "SUPPORT" as const, effectiveStrength: 1, dependenceFamilyKey: `${knowledgeId}:canonical` }]),
    truthQualification: "KNOWN" as const,
    contradictionQualified: false,
    presence: "PRESENT" as const,
    interval: Object.freeze({ validFrom: null, validTo: null }),
  });
}

function preferenceValues(constraints: readonly ForensicBuild2SellerConstraint[], suffix: string): readonly string[] {
  return Object.freeze([...new Set(constraints.filter((item) => item.semanticDependencyKey.endsWith(`.${suffix}`)).flatMap((item) => item.sourceValues).map((item) => item.trim()).filter(Boolean))].sort());
}

function matchPreference(actual: string | null, values: readonly string[], geography = false): "MATCH" | "MISMATCH" | "UNRESOLVED" {
  if (!actual?.trim() || values.length === 0) return "UNRESOLVED";
  const normaliseFn = geography ? normaliseGeography : normalise;
  const a = normaliseFn(actual);
  if (!a) return "UNRESOLVED";
  return values.some((value) => normaliseFn(value) === a) ? "MATCH" : "MISMATCH";
}

export function produceForensicBuild2CommercialReality(input: ForensicBuild2ProductionInput): ForensicBuild2CommercialRealityProduction {
  canonical(input.opportunityId, "OPPORTUNITY_ID");
  canonical(input.targetTruthEntityId, "TARGET_TRUTH_ENTITY_ID");
  canonical(input.targetTruthSnapshotId, "TARGET_TRUTH_SNAPSHOT_ID");
  canonical(input.seller.sellerEntityId, "SELLER_ENTITY_ID");
  canonical(input.seller.selectedCommercialObjectiveId, "COMMERCIAL_OBJECTIVE_ID");
  if (input.targetTruth.truthSemanticsVersion !== MARKETROUTE_FORENSIC_BUILD2_TRUTH_SEMANTICS) throw new Error("MR_FB2_REQUIRES_TFR1_TRUTH");
  if (!Number.isFinite(Date.parse(input.referenceTime))) throw new Error("MR_FB2_INVALID:REFERENCE_TIME");

  const targetCommercialEntityId = `gen:g8:company:${input.targetTruthEntityId}`;
  const targetIdentity = contribution(input.targetTruth, "identity");
  const targetOperation = contribution(input.targetTruth, "current_operation");
  const targetIndustry = contribution(input.targetTruth, "industry");
  const targetGeography = contribution(input.targetTruth, "geography");

  const mathInputs: GenesisT8ConstraintMathInput[] = [];
  const contexts: GenesisT8CoherenceConstraintContext[] = [];

  const add = (math: GenesisT8ConstraintMathInput, context: GenesisT8CoherenceConstraintContext): void => { mathInputs.push(math); contexts.push(context); };

  const sellerOffering = input.seller.boundaryConstraints.find((item) => item.semanticDependencyKey === "seller.has_persisted_commercial_offering");
  const sellerObjective = input.seller.boundaryConstraints.find((item) => item.semanticDependencyKey === "seller.selected_commercial_objective");
  if (!sellerOffering || !sellerObjective) throw new Error("MR_FB2_SELLER_BOUNDARY_CONTRACT_INCOMPLETE");

  add({ constraintId: sellerOffering.constraintId, constraintClass: "BOUNDARY", applicability: "APPLICABLE", semanticPolarity: "SUPPORTS_REALITY", truth: SELLER_CANONICAL_TRUTH },
    { constraintId: sellerOffering.constraintId, reinforcementGroupKey: "seller.offering.exists", dimensions: dimensions(sellerOffering.relevantDimensions, ["COMMERCIAL", "OPERATIONAL"]) });
  add({ constraintId: sellerObjective.constraintId, constraintClass: "BOUNDARY", applicability: "APPLICABLE", semanticPolarity: "SUPPORTS_REALITY", truth: SELLER_CANONICAL_TRUTH },
    { constraintId: sellerObjective.constraintId, reinforcementGroupKey: "seller.objective.selected", dimensions: dimensions(sellerObjective.relevantDimensions, ["COMMERCIAL", "STRATEGIC"]) });

  const targetIdentityConstraintId = `mrfb2:${hash([input.targetTruthEntityId, "identity"]).slice(0, 24)}`;
  add({ constraintId: targetIdentityConstraintId, constraintClass: "BOUNDARY", applicability: targetIdentity?.represented ? "APPLICABLE" : "UNRESOLVED", semanticPolarity: targetIdentity?.represented ? "SUPPORTS_REALITY" : "UNKNOWN", truth: truthChannels(targetIdentity) },
    { constraintId: targetIdentityConstraintId, reinforcementGroupKey: "target.identity", dimensions: Object.freeze(["SEMANTIC", "STRUCTURAL"]) });

  const targetOperationConstraintId = `mrfb2:${hash([input.targetTruthEntityId, "current_operation"]).slice(0, 24)}`;
  add({ constraintId: targetOperationConstraintId, constraintClass: "BOUNDARY", applicability: targetOperation?.represented ? "APPLICABLE" : "UNRESOLVED", semanticPolarity: targetOperation?.represented ? "SUPPORTS_REALITY" : "UNKNOWN", truth: truthChannels(targetOperation) },
    { constraintId: targetOperationConstraintId, reinforcementGroupKey: "target.current_operation", dimensions: Object.freeze(["OPERATIONAL", "COMMERCIAL"]) });

  const activePreferenceTypes = new Set<string>();
  const industryPreferences = preferenceValues(input.seller.limitingConstraints, "industries");
  if (industryPreferences.length) {
    activePreferenceTypes.add("industries");
    const match = matchPreference(input.targetFacts.industry, industryPreferences, false);
    const id = `mrfb2:${hash([input.seller.constraintFingerprint, "industry-preference"]).slice(0, 24)}`;
    add({ constraintId: id, constraintClass: "LIMITING", applicability: match === "UNRESOLVED" || !targetIndustry?.represented ? "UNRESOLVED" : "APPLICABLE", semanticPolarity: match === "MATCH" ? "SUPPORTS_REALITY" : match === "MISMATCH" ? "OPPOSES_REALITY" : "UNKNOWN", truth: truthChannels(targetIndustry) },
      { constraintId: id, reinforcementGroupKey: "target.preference.industry", dimensions: Object.freeze(["COMMERCIAL", "STRATEGIC"]) });
  }

  const geographyPreferences = preferenceValues(input.seller.limitingConstraints, "geographies");
  if (geographyPreferences.length) {
    activePreferenceTypes.add("geographies");
    const match = matchPreference(input.targetFacts.country, geographyPreferences, true);
    const id = `mrfb2:${hash([input.seller.constraintFingerprint, "geography-preference"]).slice(0, 24)}`;
    add({ constraintId: id, constraintClass: "LIMITING", applicability: match === "UNRESOLVED" || !targetGeography?.represented ? "UNRESOLVED" : "APPLICABLE", semanticPolarity: match === "MATCH" ? "SUPPORTS_REALITY" : match === "MISMATCH" ? "OPPOSES_REALITY" : "UNKNOWN", truth: truthChannels(targetGeography) },
      { constraintId: id, reinforcementGroupKey: "target.preference.geography", dimensions: Object.freeze(["STRUCTURAL", "COMMERCIAL"]) });
  }

  // Build 2 deliberately does not fabricate company-size, buyer-role or pain relationships.
  // They remain deferred until a structured relationship/target semantic adapter exists.
  const deferredSellerConstraintIds = Object.freeze(input.seller.limitingConstraints
    .filter((item) => ![...activePreferenceTypes].some((suffix) => item.semanticDependencyKey.endsWith(`.${suffix}`)))
    .map((item) => item.constraintId).sort());

  const localConstraints = Object.freeze(mathInputs.map(evaluateLocalConstraint));
  // Build 5 will wire canonical relationship dependencies. Build 2 uses only direct premises.
  const propagation = propagateConstraintStates(localConstraints, Object.freeze([]));
  const constraintContexts = Object.freeze([...contexts].sort((a, b) => a.constraintId.localeCompare(b.constraintId)));
  const commercial = evaluateCommercialCoherence(propagation, constraintContexts);

  const sellerOfferKnowledge = sellerKnowledge(input.seller.sellerEntityId, "offering-present");
  const sellerObjectiveKnowledge = sellerKnowledge(input.seller.sellerEntityId, "objective-selected");
  const targetIdentityKnowledge = targetKnowledge(input.targetTruthEntityId, "identity", targetIdentity, input.referenceTime);
  const targetOperationKnowledge = targetKnowledge(input.targetTruthEntityId, "current_operation", targetOperation, input.referenceTime);
  const knowledge = Object.freeze([sellerOfferKnowledge, sellerObjectiveKnowledge, targetIdentityKnowledge, targetOperationKnowledge]);
  const decisionCriticalKnowledgeIds = Object.freeze(knowledge.map((item) => item.knowledgeId));

  const composition = composeTruthIntoCommercialReality({
    identity: Object.freeze({
      sellerEntityId: input.seller.sellerEntityId,
      offeringEntityId: `gen:offering:bundle:${input.seller.constraintFingerprint.slice(0, 32)}`,
      targetEntityId: targetCommercialEntityId,
      commercialObjectiveId: input.seller.selectedCommercialObjectiveId,
    }),
    commercial,
    governingConstraintIds: Object.freeze(localConstraints.map((item) => item.constraintId).sort()),
    supportingEvidenceTokenIds: Object.freeze([]),
    knowledge,
    decisionCriticalKnowledgeIds,
    realityInterval: Object.freeze({ validFrom: null, validTo: null }),
    referenceTime: input.referenceTime,
  });
  const decision = evaluateCieR4CommercialDecision({ opportunityId: input.opportunityId, composition, propagation, constraintContexts });

  const authorityFingerprint = buildR4MaterialAuthorityFingerprint({
    sellerContextFingerprint: input.seller.sellerContextFingerprint,
    constraintFingerprint: input.seller.constraintFingerprint,
    targetTruthEntityId: input.targetTruthEntityId,
    targetFacts: input.targetFacts,
    propagation,
    decision,
  });

  const inputFingerprint = hash({
    producerVersion: MARKETROUTE_FORENSIC_BUILD2_PRODUCER_VERSION,
    sellerContextFingerprint: input.seller.sellerContextFingerprint,
    constraintFingerprint: input.seller.constraintFingerprint,
    targetTruthEntityId: input.targetTruthEntityId,
    targetTruthSnapshotId: input.targetTruthSnapshotId,
    targetTruthSemanticsVersion: input.targetTruth.truthSemanticsVersion,
    targetTruthCalculatedAt: input.targetTruth.calculatedAt,
    targetFacts: input.targetFacts,
    activeConstraintIds: localConstraints.map((item) => item.constraintId),
    deferredSellerConstraintIds,
  });

  return Object.freeze({
    producerVersion: MARKETROUTE_FORENSIC_BUILD2_PRODUCER_VERSION,
    inputFingerprint,
    authorityFingerprint,
    sellerContextFingerprint: input.seller.sellerContextFingerprint,
    constraintFingerprint: input.seller.constraintFingerprint,
    targetTruthEntityId: input.targetTruthEntityId,
    targetTruthSnapshotId: input.targetTruthSnapshotId,
    targetTruthSemanticsVersion: input.targetTruth.truthSemanticsVersion,
    targetCommercialEntityId,
    referenceTime: input.referenceTime,
    localConstraints,
    propagation,
    constraintContexts,
    composition,
    decision,
    deferredSellerConstraintIds,
  });
}

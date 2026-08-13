import "server-only";
import { createHash } from "node:crypto";
import { databaseRequest } from "@/lib/database/postgrest";
import { isPipelineOwnershipLost } from "@/lib/pipeline/ownership";
import { G5EngagementQualitySchema, type G5EngagementQuality } from "./g5-engagement-quality-schema";

export type G5EngagementQualityWorkerResult = {
  processed: boolean;
  outcome: "NO_JOB" | "COMPLETED" | "FAILED_RETRYABLE" | "SUPERSEDED";
  strategyId?: string;
  opportunityId?: string;
  engagementConfidence?: number;
};

type Claim = { strategy_id: string; lease_token: string; opportunity_id: string };
type Context = {
  self_review_json: Record<string, unknown>;
  self_review_outcome: string;
  self_review_confidence: number;
  channel_strategy_json: Record<string, unknown>;
  personalisation_safety_json: Record<string, unknown>;
  rewrite_count: number;
};

function score(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : fallback;
}
function avg(...values: number[]): number {
  return Math.round(values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length));
}
function weighted(parts: Array<[number, number]>): number {
  const totalWeight = parts.reduce((sum, [, weight]) => sum + weight, 0);
  return Math.round(parts.reduce((sum, [value, weight]) => sum + value * weight, 0) / Math.max(1, totalWeight));
}
function countArray(value: unknown): number { return Array.isArray(value) ? value.length : 0; }

export function buildG5EngagementQuality(context: Context): G5EngagementQuality {
  if (context.self_review_outcome !== "PASS") throw new Error("G5_QUALITY_REQUIRES_PASS");
  const review = context.self_review_json;
  const channel = context.channel_strategy_json;
  const safety = context.personalisation_safety_json;

  const factual = score(review.factualAccuracy);
  const evidence = score(review.evidenceAlignment);
  const route = score(review.routeAlignment);
  const hallucination = score(review.hallucinationRisk);
  const tone = score(review.tone);
  const length = score(review.messageLength);
  const clarity = score(review.commercialClarity);
  const cta = score(review.ctaQuality);
  const spam = score(review.spamCharacteristics);
  const overclaim = score(review.overclaiming);
  const personalisation = score(review.personalisationRelevance);
  const channelConfidence = score(channel.channelConfidence);
  const selfReviewConfidence = score(context.self_review_confidence ?? review.overallConfidence);

  const verifiedFactCount = countArray(safety.verifiedFactIds);
  const commercialInferenceCount = countArray(safety.commercialInferenceIds);
  const evidenceBase = avg(factual, evidence);
  const evidenceStrength = verifiedFactCount > 0 ? evidenceBase : Math.max(0, evidenceBase - 15);

  const dimensions = {
    commercialRelevance: avg(clarity, personalisation),
    routeAlignment: route,
    evidenceStrength,
    personalisationQuality: personalisation,
    messageClarity: avg(tone, length, clarity),
    ctaQuality: cta,
    channelSuitability: avg(route, channelConfidence),
    riskSafety: avg(hallucination, spam, overclaim),
  };

  // Forensic Build 8: weighted engagementConfidence is diagnostic telemetry only.
  // It must never gate state, approval, queueing or execution.
  const engagementConfidence = weighted([
    [dimensions.commercialRelevance, 18],
    [dimensions.routeAlignment, 14],
    [dimensions.evidenceStrength, 18],
    [dimensions.personalisationQuality, 10],
    [dimensions.messageClarity, 12],
    [dimensions.ctaQuality, 10],
    [dimensions.channelSuitability, 10],
    [dimensions.riskSafety, 8],
  ]);

  const strengths: string[] = [];
  const cautions: string[] = [];
  const explainability: G5EngagementQuality["explainability"] = [
    { code: "ROUTE_VERIFIED", label: "Diagnostic: selected route received strong route-alignment review", passed: route >= 90, score: route },
    { code: "EVIDENCE_ALIGNED", label: "Diagnostic: claims received strong evidence-alignment review", passed: evidence >= 85, score: evidence },
    { code: "FACTUALLY_SAFE", label: "Diagnostic: factual-accuracy score is strong", passed: factual >= 90, score: factual },
    { code: "PERSONALISATION_RELEVANT", label: "Diagnostic: personalisation relevance score is strong", passed: personalisation >= 80, score: personalisation },
    { code: "CTA_CLEAR", label: "Diagnostic: CTA quality score is strong", passed: cta >= 80, score: cta },
    { code: "CHANNEL_SUITABLE", label: "Diagnostic: channel-suitability score is strong", passed: dimensions.channelSuitability >= 85, score: dimensions.channelSuitability },
    { code: "NO_UNSUPPORTED_CLAIMS", label: "Independent review found no unsupported claims", passed: countArray(review.unsupportedClaims) === 0, score: null },
    { code: "SAFETY_STRONG", label: "Diagnostic: safety-related scores are strong", passed: dimensions.riskSafety >= 80, score: dimensions.riskSafety },
  ];

  for (const item of explainability) {
    if (item.passed) strengths.push(item.label);
    else cautions.push(item.label);
  }
  if (context.rewrite_count > 0) cautions.push(`Message required ${context.rewrite_count} automatic rewrite${context.rewrite_count === 1 ? "" : "s"} before passing review.`);
  if (commercialInferenceCount > verifiedFactCount && commercialInferenceCount > 0) cautions.push("Commercial reasoning relies on more framed inferences than verified personalisation facts.");

  return G5EngagementQualitySchema.parse({
    schemaVersion: "g5-engagement-quality/v1",
    policyVersion: "g5-engagement-quality/fb8-categorical-v2",
    engagementConfidence,
    dimensions,
    strengths: strengths.slice(0, 12),
    cautions: cautions.slice(0, 12),
    explainability,
    source: { selfReviewOutcome: "PASS", selfReviewConfidence, channelConfidence, verifiedFactCount, commercialInferenceCount, rewriteCount: context.rewrite_count },
    immutableG4: true,
  });
}

export async function runNextG5EngagementQuality(schedulerRunId: string): Promise<G5EngagementQualityWorkerResult> {
  const claims = await databaseRequest<Claim[]>("rpc/claim_g5_engagement_quality", { method: "POST", body: JSON.stringify({ p_scheduler_run_id: schedulerRunId, p_lease_seconds: 120 }) });
  const claim = claims[0];
  if (!claim) return { processed: false, outcome: "NO_JOB" };
  try {
    const rows = await databaseRequest<Context[]>("rpc/get_g5_engagement_quality_context_owned", { method: "POST", body: JSON.stringify({ p_strategy_id: claim.strategy_id, p_scheduler_run_id: schedulerRunId, p_lease_token: claim.lease_token }) });
    const context = rows[0];
    if (!context) throw new Error("G5_ENGAGEMENT_QUALITY_CONTEXT_MISSING");
    const quality = buildG5EngagementQuality(context);
    const fingerprint = createHash("sha256").update(JSON.stringify({ review: context.self_review_json, channel: context.channel_strategy_json, safety: context.personalisation_safety_json, rewriteCount: context.rewrite_count }), "utf8").digest("hex");
    await databaseRequest("rpc/complete_g5_engagement_quality_owned", { method: "POST", body: JSON.stringify({ p_strategy_id: claim.strategy_id, p_scheduler_run_id: schedulerRunId, p_lease_token: claim.lease_token, p_quality_json: quality, p_schema_version: quality.schemaVersion, p_policy_version: quality.policyVersion, p_engagement_confidence: quality.engagementConfidence, p_source_fingerprint: fingerprint }) });
    return { processed: true, outcome: "COMPLETED", strategyId: claim.strategy_id, opportunityId: claim.opportunity_id, engagementConfidence: quality.engagementConfidence };
  } catch (error) {
    if (isPipelineOwnershipLost(error) || (error instanceof Error && error.message.includes("G5_ENGAGEMENT_OWNERSHIP_LOST"))) return { processed: false, outcome: "SUPERSEDED", strategyId: claim.strategy_id, opportunityId: claim.opportunity_id };
    await databaseRequest("rpc/fail_g5_engagement_quality_owned", { method: "POST", body: JSON.stringify({ p_strategy_id: claim.strategy_id, p_scheduler_run_id: schedulerRunId, p_lease_token: claim.lease_token, p_reason: error instanceof Error ? error.message : "G5_ENGAGEMENT_QUALITY_FAILED", p_retry_after_seconds: 60 }) }).catch(() => undefined);
    return { processed: true, outcome: "FAILED_RETRYABLE", strategyId: claim.strategy_id, opportunityId: claim.opportunity_id };
  }
}

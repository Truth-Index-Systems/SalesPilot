import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";
import { isPipelineOwnershipLost } from "@/lib/pipeline/ownership";
import { reviewEngagementDraft } from "./self-review-openai";
import { recordEngagementStage } from "./strategy";
import { safePipelineFailureReason } from "@/lib/pipeline/safe-error";

export type EngagementSelfReviewWorkerResult = {
  processed: boolean;
  outcome: "NO_JOB" | "COMPLETED" | "FAILED_RETRYABLE" | "SUPERSEDED";
  reviewId?: string;
  draftId?: string;
  engagementId?: string;
  approvedByAI?: boolean;
  engagementScore?: number;
};

type Claim = {
  review_id: string;
  draft_id: string;
  organisation_id: string;
  campaign_id: string;
  engagement_id: string;
  context_json: Record<string, unknown>;
};

export async function runNextEngagementSelfReview(schedulerRunId: string): Promise<EngagementSelfReviewWorkerResult> {
  const claimed = await databaseRequest<Claim[]>("rpc/claim_engagement_self_review_owned", {
    method: "POST",
    body: JSON.stringify({ p_scheduler_run_id: schedulerRunId }),
  });
  const job = claimed[0];
  if (!job) return { processed: false, outcome: "NO_JOB" };

  try {
    await recordEngagementStage({ engagementId: job.engagement_id, schedulerRunId, stage: "AI_QUALITY_REVIEW", state: "RUNNING", reason: "Independently reviewing engagement quality and route alignment.", worker: "engagement-self-review" });
    const reviewed = await reviewEngagementDraft({
      organisationId: job.organisation_id,
      campaignId: job.campaign_id,
      schedulerRunId,
      reviewId: job.review_id,
      context: job.context_json,
    });
    await databaseRequest("rpc/complete_engagement_self_review_owned", {
      method: "POST",
      body: JSON.stringify({
        p_review_id: job.review_id,
        p_scheduler_run_id: schedulerRunId,
        p_output_json: reviewed.result,
        p_prompt_version: reviewed.result.promptVersion,
        p_schema_version: reviewed.result.schemaVersion,
        p_score: reviewed.result.combinedScore,
        p_confidence: reviewed.result.confidence,
        p_approved_by_ai: reviewed.result.approvedByAI,
        p_model: reviewed.model,
        p_input_tokens: reviewed.usage?.input_tokens ?? null,
        p_output_tokens: reviewed.usage?.output_tokens ?? null,
        p_duration_ms: reviewed.durationMs,
        p_response_id: reviewed.responseId,
      }),
    });
    await recordEngagementStage({ engagementId: job.engagement_id, schedulerRunId, stage: "HUMAN_REVIEW", state: "READY", reason: "AI quality review completed; engagement is ready for human decision.", worker: "engagement-self-review", metadata: { approvedByAI: reviewed.result.approvedByAI, score: reviewed.result.combinedScore } });
    return { processed: true, outcome: "COMPLETED", reviewId: job.review_id, draftId: job.draft_id, engagementId: job.engagement_id, approvedByAI: reviewed.result.approvedByAI, engagementScore: reviewed.result.combinedScore };
  } catch (error) {
    if (isPipelineOwnershipLost(error)) return { processed: false, outcome: "SUPERSEDED", reviewId: job.review_id, draftId: job.draft_id, engagementId: job.engagement_id };
    const safeReason = safePipelineFailureReason(error, "AI quality review encountered a technical interruption and will retry safely.");
    await recordEngagementStage({ engagementId: job.engagement_id, schedulerRunId, stage: "AI_QUALITY_REVIEW", state: "RETRYING", reason: safeReason, worker: "engagement-self-review" }).catch(() => undefined);
    await databaseRequest("rpc/fail_engagement_self_review_owned", {
      method: "POST",
      body: JSON.stringify({ p_review_id: job.review_id,
        p_scheduler_run_id: schedulerRunId, p_error: safeReason }),
    }).catch(() => undefined);
    return { processed: true, outcome: "FAILED_RETRYABLE", reviewId: job.review_id, draftId: job.draft_id, engagementId: job.engagement_id };
  }
}

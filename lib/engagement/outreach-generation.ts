import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";
import { isPipelineOwnershipLost } from "@/lib/pipeline/ownership";
import { generateOutreach } from "./outreach-generation-openai";
import { recordEngagementStage } from "./strategy";
import { safePipelineFailureReason } from "@/lib/pipeline/safe-error";

export type OutreachGenerationWorkerResult = {
  processed: boolean;
  outcome: "NO_JOB" | "COMPLETED" | "FAILED_RETRYABLE" | "SUPERSEDED";
  draftId?: string;
  engagementId?: string;
};

type Claim = {
  draft_id: string;
  organisation_id: string;
  campaign_id: string;
  engagement_id: string;
  context_json: Record<string, unknown>;
};

export async function runNextOutreachGeneration(schedulerRunId: string): Promise<OutreachGenerationWorkerResult> {
  const claimed = await databaseRequest<Claim[]>("rpc/claim_engagement_outreach_generation_owned", {
    method: "POST",
    body: JSON.stringify({ p_scheduler_run_id: schedulerRunId }),
  });
  const job = claimed[0];
  if (!job) return { processed: false, outcome: "NO_JOB" };

  try {
    await recordEngagementStage({ engagementId: job.engagement_id, schedulerRunId, stage: "CHANNEL_CONTENT_GENERATION", state: "RUNNING", reason: "Generating content for the recommended engagement channel.", worker: "channel-content-generation" });
    const generated = await generateOutreach({
      organisationId: job.organisation_id,
      campaignId: job.campaign_id,
      schedulerRunId,
      draftId: job.draft_id,
      context: job.context_json,
    });
    await databaseRequest("rpc/complete_engagement_outreach_generation_owned", {
      method: "POST",
      body: JSON.stringify({
        p_draft_id: job.draft_id,
        p_scheduler_run_id: schedulerRunId,
        p_output_json: generated.result,
        p_prompt_version: generated.result.promptVersion,
        p_schema_version: generated.result.schemaVersion,
        p_confidence: generated.result.confidence,
        p_model: generated.model,
        p_input_tokens: generated.usage?.input_tokens ?? null,
        p_output_tokens: generated.usage?.output_tokens ?? null,
        p_duration_ms: generated.durationMs,
        p_response_id: generated.responseId,
      }),
    });
    await recordEngagementStage({ engagementId: job.engagement_id, schedulerRunId, stage: "AI_QUALITY_REVIEW", state: "READY", reason: "Channel content generated and ready for independent review.", worker: "channel-content-generation" });
    return { processed: true, outcome: "COMPLETED", draftId: job.draft_id, engagementId: job.engagement_id };
  } catch (error) {
    if (isPipelineOwnershipLost(error)) return { processed: false, outcome: "SUPERSEDED", draftId: job.draft_id, engagementId: job.engagement_id };
    const safeReason = safePipelineFailureReason(error, "Channel content generation encountered a technical interruption and will retry safely.");
    await recordEngagementStage({ engagementId: job.engagement_id, schedulerRunId, stage: "CHANNEL_CONTENT_GENERATION", state: "RETRYING", reason: safeReason, worker: "channel-content-generation" }).catch(() => undefined);
    await databaseRequest("rpc/fail_engagement_outreach_generation_owned", {
      method: "POST",
      body: JSON.stringify({ p_draft_id: job.draft_id,
        p_scheduler_run_id: schedulerRunId, p_error: safeReason }),
    }).catch(() => undefined);
    return { processed: true, outcome: "FAILED_RETRYABLE", draftId: job.draft_id, engagementId: job.engagement_id };
  }
}

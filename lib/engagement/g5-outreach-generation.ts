import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";
import { isPipelineOwnershipLost } from "@/lib/pipeline/ownership";
import { aiGovernanceBlockReason } from "@/lib/ai/governance";
import { isOpenAIBackgroundPending } from "@/lib/ai/background-response";
import { generateG5Outreach } from "./g5-outreach-generation-openai";

export type G5OutreachGenerationWorkerResult = {
  processed: boolean;
  outcome: "NO_JOB" | "COMPLETED" | "FAILED_RETRYABLE" | "SUPERSEDED" | "DEFERRED";
  strategyId?: string;
  opportunityId?: string;
};

type Claim = { strategy_id: string; lease_token: string; opportunity_id: string };
type Context = {
  organisation_id: string;
  campaign_id: string;
  commercial_reasoning_json: Record<string, unknown>;
  channel_strategy_json: Record<string, unknown>;
  source_snapshot_json: Record<string, unknown>;
  personalisation_safety_json: Record<string, unknown>;
  rewrite_instruction_json: Record<string, unknown> | null;
};

export async function runNextG5OutreachGeneration(schedulerRunId: string): Promise<G5OutreachGenerationWorkerResult> {
  const claims = await databaseRequest<Claim[]>("rpc/claim_g5_outreach_generation", {
    method: "POST",
    body: JSON.stringify({ p_scheduler_run_id: schedulerRunId, p_lease_seconds: 180 }),
  });
  const claim = claims[0];
  if (!claim) return { processed: false, outcome: "NO_JOB" };

  try {
    const rows = await databaseRequest<Context[]>("rpc/get_g5_outreach_generation_context_owned", {
      method: "POST",
      body: JSON.stringify({
        p_strategy_id: claim.strategy_id,
        p_scheduler_run_id: schedulerRunId,
        p_lease_token: claim.lease_token,
      }),
    });
    const context = rows[0];
    if (!context) throw new Error("G5_OUTREACH_GENERATION_CONTEXT_MISSING");

    const generated = await generateG5Outreach({
      organisationId: context.organisation_id,
      campaignId: context.campaign_id,
      schedulerRunId,
      strategyId: claim.strategy_id,
      commercialReasoning: context.commercial_reasoning_json,
      channelStrategy: context.channel_strategy_json,
      sourceSnapshot: context.source_snapshot_json,
      personalisationSafety: context.personalisation_safety_json,
      rewriteInstruction: context.rewrite_instruction_json,
    });

    await databaseRequest("rpc/complete_g5_outreach_generation_owned", {
      method: "POST",
      body: JSON.stringify({
        p_strategy_id: claim.strategy_id,
        p_scheduler_run_id: schedulerRunId,
        p_lease_token: claim.lease_token,
        p_outreach_json: generated.result,
        p_schema_version: generated.result.schemaVersion,
        p_prompt_version: generated.result.promptVersion,
        p_model: generated.model,
        p_confidence: generated.result.confidence,
        p_source_fingerprint: generated.sourceFingerprint,
      }),
    });

    return { processed: true, outcome: "COMPLETED", strategyId: claim.strategy_id, opportunityId: claim.opportunity_id };
  } catch (error) {
    if (isOpenAIBackgroundPending(error)) {
      await databaseRequest("rpc/defer_g5_engagement_background_owned", { method: "POST", body: JSON.stringify({ p_strategy_id: claim.strategy_id, p_scheduler_run_id: schedulerRunId, p_lease_token: claim.lease_token, p_active_state: "GENERATING", p_resume_state: "STRATEGY_READY" }) }).catch(() => undefined);
      return { processed: false, outcome: "DEFERRED", strategyId: claim.strategy_id, opportunityId: claim.opportunity_id };
    }
    const governanceReason = aiGovernanceBlockReason(error);
    if (governanceReason) {
      await databaseRequest("rpc/defer_g5_engagement_governance_owned", { method: "POST", body: JSON.stringify({ p_strategy_id: claim.strategy_id, p_scheduler_run_id: schedulerRunId, p_lease_token: claim.lease_token, p_active_state: "GENERATING", p_resume_state: "STRATEGY_READY", p_reason_code: governanceReason }) }).catch(() => undefined);
      return { processed: false, outcome: "DEFERRED", strategyId: claim.strategy_id, opportunityId: claim.opportunity_id };
    }
    if (isPipelineOwnershipLost(error) || (error instanceof Error && error.message.includes("G5_ENGAGEMENT_OWNERSHIP_LOST"))) {
      return { processed: false, outcome: "SUPERSEDED", strategyId: claim.strategy_id, opportunityId: claim.opportunity_id };
    }
    await databaseRequest("rpc/fail_g5_outreach_generation_owned", {
      method: "POST",
      body: JSON.stringify({
        p_strategy_id: claim.strategy_id,
        p_scheduler_run_id: schedulerRunId,
        p_lease_token: claim.lease_token,
        p_reason: error instanceof Error ? error.message : "G5_OUTREACH_GENERATION_FAILED",
        p_retry_after_seconds: 60,
      }),
    }).catch(() => undefined);
    return { processed: true, outcome: "FAILED_RETRYABLE", strategyId: claim.strategy_id, opportunityId: claim.opportunity_id };
  }
}

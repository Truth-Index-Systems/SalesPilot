import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";
import { isPipelineOwnershipLost } from "@/lib/pipeline/ownership";
import { aiGovernanceBlockReason } from "@/lib/ai/governance";
import { failG5EngagementStrategy, seedG5EngagementStrategies } from "./g5-state-machine";
import { generateG5CommercialReasoning } from "./g5-commercial-reasoning-openai";

export type G5CommercialReasoningWorkerResult = {
  processed: boolean;
  outcome: "NO_JOB" | "COMPLETED" | "FAILED_RETRYABLE" | "SUPERSEDED" | "DEFERRED";
  strategyId?: string;
  opportunityId?: string;
};

type G5ReasoningContext = {
  organisation_id: string;
  campaign_id: string;
  context_json: Record<string, unknown>;
};

export async function runNextG5CommercialReasoning(schedulerRunId: string): Promise<G5CommercialReasoningWorkerResult> {
  await seedG5EngagementStrategies(schedulerRunId);

  const claims = await databaseRequest<Array<{ strategy_id: string; lease_token: string; opportunity_id: string; source_engagement_id: string | null }>>(
    "rpc/claim_g5_commercial_reasoning",
    { method: "POST", body: JSON.stringify({ p_scheduler_run_id: schedulerRunId, p_lease_seconds: 180 }) },
  );
  const claim = claims[0] ?? null;
  if (!claim) return { processed: false, outcome: "NO_JOB" };

  try {
    const contextRows = await databaseRequest<G5ReasoningContext[]>("rpc/get_g5_commercial_reasoning_context_owned", {
      method: "POST",
      body: JSON.stringify({
        p_strategy_id: claim.strategy_id,
        p_scheduler_run_id: schedulerRunId,
        p_lease_token: claim.lease_token,
      }),
    });
    const context = contextRows[0];
    if (!context) throw new Error("G5_COMMERCIAL_REASONING_CONTEXT_MISSING");

    const generated = await generateG5CommercialReasoning({
      organisationId: context.organisation_id,
      campaignId: context.campaign_id,
      schedulerRunId,
      strategyId: claim.strategy_id,
      context: context.context_json,
    });

    await databaseRequest("rpc/complete_g5_commercial_reasoning_owned", {
      method: "POST",
      body: JSON.stringify({
        p_strategy_id: claim.strategy_id,
        p_scheduler_run_id: schedulerRunId,
        p_lease_token: claim.lease_token,
        p_reasoning_json: generated.result,
        p_schema_version: generated.result.schemaVersion,
        p_prompt_version: generated.result.promptVersion,
        p_model: generated.model,
        p_confidence: generated.result.reasoningConfidence,
        p_source_fingerprint: generated.sourceFingerprint,
        p_source_snapshot_json: generated.sourceSnapshot,
      }),
    });

    return { processed: true, outcome: "COMPLETED", strategyId: claim.strategy_id, opportunityId: claim.opportunity_id };
  } catch (error) {
    const governanceReason = aiGovernanceBlockReason(error);
    if (governanceReason) {
      await databaseRequest("rpc/defer_g5_engagement_governance_owned", { method: "POST", body: JSON.stringify({ p_strategy_id: claim.strategy_id, p_scheduler_run_id: schedulerRunId, p_lease_token: claim.lease_token, p_active_state: "REASONING", p_resume_state: "WAITING", p_reason_code: governanceReason }) }).catch(() => undefined);
      return { processed: false, outcome: "DEFERRED", strategyId: claim.strategy_id, opportunityId: claim.opportunity_id };
    }
    if (isPipelineOwnershipLost(error) || (error instanceof Error && error.message.includes("G5_ENGAGEMENT_OWNERSHIP_LOST"))) {
      return { processed: false, outcome: "SUPERSEDED", strategyId: claim.strategy_id, opportunityId: claim.opportunity_id };
    }
    await failG5EngagementStrategy({
      strategyId: claim.strategy_id,
      schedulerRunId,
      leaseToken: claim.lease_token,
      failureStage: "COMMERCIAL_REASONING",
      reason: error instanceof Error ? error.message : "G5_COMMERCIAL_REASONING_FAILED",
      retryable: true,
      retryAfterSeconds: 60,
    }).catch(() => undefined);
    return { processed: true, outcome: "FAILED_RETRYABLE", strategyId: claim.strategy_id, opportunityId: claim.opportunity_id };
  }
}

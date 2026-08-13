import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";
import { isPipelineOwnershipLost } from "@/lib/pipeline/ownership";
import { G5ChannelStrategySchema } from "./g5-channel-strategy-schema";

export type G5ChannelStrategyWorkerResult = {
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
  source_snapshot_json: Record<string, unknown>;
};
type PersistedR5Authority = {
  strategy_json: Record<string, unknown>;
  authority_fingerprint: string;
  source_fingerprint: string;
};

export async function runNextG5ChannelStrategy(schedulerRunId: string): Promise<G5ChannelStrategyWorkerResult> {
  const claims = await databaseRequest<Claim[]>("rpc/claim_g5_channel_strategy", {
    method: "POST",
    body: JSON.stringify({ p_scheduler_run_id: schedulerRunId, p_lease_seconds: 180 }),
  });
  const claim = claims[0];
  if (!claim) return { processed: false, outcome: "NO_JOB" };

  try {
    // Retain the canonical G5 ownership/context gate. Build 5 deliberately does not
    // re-run R5 against this historical reasoning snapshot; R5 has one persisted
    // authority ledger and engagement must consume that exact decision.
    const rows = await databaseRequest<Context[]>("rpc/get_g5_channel_strategy_context_owned", {
      method: "POST",
      body: JSON.stringify({
        p_strategy_id: claim.strategy_id,
        p_scheduler_run_id: schedulerRunId,
        p_lease_token: claim.lease_token,
      }),
    });
    const context = rows[0];
    if (!context) throw new Error("G5_CHANNEL_STRATEGY_CONTEXT_MISSING");

    const authorityRows = await databaseRequest<PersistedR5Authority[]>("rpc/get_cie_r5_route_authority_for_engagement_owned", {
      method: "POST",
      body: JSON.stringify({
        p_strategy_id: claim.strategy_id,
        p_scheduler_run_id: schedulerRunId,
        p_lease_token: claim.lease_token,
      }),
    });
    const authority = authorityRows[0];
    if (!authority) throw new Error("CIE_R5_PERSISTED_AUTHORITY_MISSING");
    const strategy = G5ChannelStrategySchema.parse(authority.strategy_json);
    if (strategy.promptVersion !== "cie-r5-route-authority/v3") {
      throw new Error("CIE_R5_PERSISTED_AUTHORITY_VERSION_INVALID");
    }

    await databaseRequest("rpc/complete_g5_channel_strategy_owned", {
      method: "POST",
      body: JSON.stringify({
        p_strategy_id: claim.strategy_id,
        p_scheduler_run_id: schedulerRunId,
        p_lease_token: claim.lease_token,
        p_channel_strategy_json: strategy,
        p_schema_version: strategy.schemaVersion,
        p_prompt_version: strategy.promptVersion,
        p_model: "CIE-R5-PERSISTED-AUTHORITY",
        p_confidence: strategy.channelConfidence,
        p_source_fingerprint: `cie-r5-authority:${authority.authority_fingerprint}` ,
      }),
    });

    return { processed: true, outcome: "COMPLETED", strategyId: claim.strategy_id, opportunityId: claim.opportunity_id };
  } catch (error) {
    if (isPipelineOwnershipLost(error) || (error instanceof Error && error.message.includes("G5_ENGAGEMENT_OWNERSHIP_LOST"))) {
      return { processed: false, outcome: "SUPERSEDED", strategyId: claim.strategy_id, opportunityId: claim.opportunity_id };
    }
    await databaseRequest("rpc/fail_g5_channel_strategy_owned", {
      method: "POST",
      body: JSON.stringify({
        p_strategy_id: claim.strategy_id,
        p_scheduler_run_id: schedulerRunId,
        p_lease_token: claim.lease_token,
        p_reason: error instanceof Error ? error.message : "G5_CHANNEL_STRATEGY_FAILED",
        p_retry_after_seconds: 60,
      }),
    }).catch(() => undefined);
    return { processed: true, outcome: "FAILED_RETRYABLE", strategyId: claim.strategy_id, opportunityId: claim.opportunity_id };
  }
}

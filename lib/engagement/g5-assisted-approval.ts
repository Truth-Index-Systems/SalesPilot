import "server-only";
import { z } from "zod";
import { requireOrganisationContext } from "@/lib/auth/organisation-context";
import { databaseRequest } from "@/lib/database/postgrest";
import { G5CommercialReasoningSchema, type G5CommercialReasoning } from "./g5-commercial-reasoning-schema";
import { G5ChannelStrategySchema, type G5ChannelStrategy } from "./g5-channel-strategy-schema";
import { G5OutreachGenerationSchema, type G5OutreachGeneration } from "./g5-outreach-generation-schema";
import { G5EngagementQualitySchema, type G5EngagementQuality } from "./g5-engagement-quality-schema";

export type G5ApprovalStrategy = {
  id: string;
  opportunity_id: string;
  campaign_id: string;
  state: string;
  commercial_reasoning_json: G5CommercialReasoning;
  channel_strategy_json: G5ChannelStrategy;
  original_channel_strategy_json: G5ChannelStrategy;
  outreach_generation_json: G5OutreachGeneration;
  engagement_quality_json: G5EngagementQuality;
  engagement_confidence: number;
  rewrite_count: number;
  updated_at: string;
};

const ApprovalRow = z.object({
  id: z.string().uuid(), opportunity_id: z.string().uuid(), campaign_id: z.string().uuid(), state: z.string(),
  commercial_reasoning_json: z.unknown(), channel_strategy_json: z.unknown(), human_route_override_json: z.unknown().nullable().optional(), outreach_generation_json: z.unknown(),
  engagement_quality_json: z.unknown(), engagement_confidence: z.number().int().min(0).max(100), rewrite_count: z.number().int().min(0), updated_at: z.string(),
});

export async function getG5ApprovalStrategyForOpportunity(opportunityId: string): Promise<G5ApprovalStrategy | null> {
  const context = await requireOrganisationContext();
  const rows = await databaseRequest<unknown[]>(
    `engagement_strategies?organisation_id=eq.${context.organisationId}&opportunity_id=eq.${encodeURIComponent(opportunityId)}&state=in.(READY_FOR_APPROVAL,APPROVED)&select=id,opportunity_id,campaign_id,state,commercial_reasoning_json,channel_strategy_json,human_route_override_json,outreach_generation_json,engagement_quality_json,engagement_confidence,rewrite_count,updated_at&limit=1`,
  );
  if (!rows.length) return null;
  const row = ApprovalRow.parse(rows[0]);
  return {
    ...row,
    commercial_reasoning_json: G5CommercialReasoningSchema.parse(row.commercial_reasoning_json),
    channel_strategy_json: G5ChannelStrategySchema.parse(row.human_route_override_json ?? row.channel_strategy_json),
    original_channel_strategy_json: G5ChannelStrategySchema.parse(row.channel_strategy_json),
    outreach_generation_json: G5OutreachGenerationSchema.parse(row.outreach_generation_json),
    engagement_quality_json: G5EngagementQualitySchema.parse(row.engagement_quality_json),
  };
}


export type G5StrategyStatus = { id: string; state: string; failure_stage: string | null; failure_reason: string | null; human_review_action: string | null; updated_at: string };

export async function getG5StrategyStatusForOpportunity(opportunityId: string): Promise<G5StrategyStatus | null> {
  const context = await requireOrganisationContext();
  const rows = await databaseRequest<G5StrategyStatus[]>(
    `engagement_strategies?organisation_id=eq.${context.organisationId}&opportunity_id=eq.${encodeURIComponent(opportunityId)}&select=id,state,failure_stage,failure_reason,human_review_action,updated_at&limit=1`,
  );
  return rows[0] ?? null;
}

export type G5ApprovalAction = "APPROVE" | "EDIT" | "REJECT" | "TRY_SECONDARY_ROUTE";
export type G5OutreachEdit = { subject?: string | null; body: string; callToAction: string };

export async function reviewG5EngagementStrategy(strategyId: string, action: G5ApprovalAction, note?: string, edit?: G5OutreachEdit) {
  const context = await requireOrganisationContext();
  if (context.role === "VIEWER") throw new Error("G5_APPROVAL_FORBIDDEN");
  return databaseRequest("rpc/review_g5_engagement_strategy", {
    method: "POST",
    body: JSON.stringify({
      p_organisation_id: context.organisationId,
      p_user_id: context.userId,
      p_strategy_id: strategyId,
      p_action: action,
      p_note: note ?? null,
      p_edit_json: edit ?? null,
    }),
  });
}

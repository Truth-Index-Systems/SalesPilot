import "server-only";
import type { G5ChannelStrategy } from "./g5-channel-strategy-schema";

/**
 * CIE-R8 ERADICATED LEGACY AUTHORITY.
 *
 * AI may no longer select primary/secondary/fallback commercial routes. The
 * export remains only as a fail-closed compatibility symbol so a stale import
 * cannot restore AI commercial decision authority.
 */
export async function generateG5ChannelStrategy(_input: {
  organisationId: string;
  campaignId: string;
  schedulerRunId: string;
  strategyId: string;
  commercialReasoning: Record<string, unknown>;
  sourceSnapshot: Record<string, unknown>;
}): Promise<{ result: G5ChannelStrategy; model: string; sourceFingerprint: string }> {
  throw new Error("CIE_R8_AUTHORITY_VIOLATION:AI_ROUTE_SELECTION_ERADICATED");
}

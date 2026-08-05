import type { Engagement, EngagementOverview, EngagementUpdate } from "./types";

export function mapEngagementUpdate(input: EngagementUpdate): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (input.status !== undefined) result.p_status = input.status;
  if (input.generationVersion !== undefined) result.p_generation_version = input.generationVersion;
  if (input.promptVersion !== undefined) result.p_prompt_version = input.promptVersion;
  if (input.engagementScore !== undefined) result.p_engagement_score = input.engagementScore;
  if (input.confidence !== undefined) result.p_confidence = input.confidence;
  return result;
}

export function toEngagementOverview(row: EngagementOverview): EngagementOverview {
  return row;
}

export function toEngagement(row: Engagement): Engagement {
  return row;
}

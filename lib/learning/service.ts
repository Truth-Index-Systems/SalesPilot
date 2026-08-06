import "server-only";
import { runEngagementLearningBuilder } from "./repository";
import type { EngagementLearningBuilderResult } from "./types";

export async function buildEngagementLearning(schedulerRunId: string): Promise<EngagementLearningBuilderResult> {
  if (!schedulerRunId) throw new Error("ENGAGEMENT_LEARNING_BUILDER_REQUIRES_SCHEDULER_RUN");
  return runEngagementLearningBuilder(schedulerRunId);
}

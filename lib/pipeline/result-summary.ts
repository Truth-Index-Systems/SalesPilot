export type PipelineResultSummary = {
  outcome: "COMPLETED_WITH_RESULTS" | "COMPLETED_NO_RESULTS" | "ROUTE_RESEARCH_EXHAUSTED";
  saved: number;
  durationMs: number;
  completedAt: string;
};

export function createResultSummary(outcome: PipelineResultSummary["outcome"], saved: number, startedAt: number): PipelineResultSummary {
  return { outcome, saved, durationMs: Math.max(0, Date.now() - startedAt), completedAt: new Date().toISOString() };
}

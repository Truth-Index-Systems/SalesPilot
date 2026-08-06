export const intelligenceTasks = [
  "strategy",
  "analysis",
  "emails",
  "replies",
  "summaries",
] as const;

export type IntelligenceTask = (typeof intelligenceTasks)[number];

const ENV_BY_TASK: Record<IntelligenceTask, string> = {
  strategy: "OPENAI_MODEL_STRATEGY",
  analysis: "OPENAI_MODEL_ANALYSIS",
  emails: "OPENAI_MODEL_EMAILS",
  replies: "OPENAI_MODEL_REPLIES",
  summaries: "OPENAI_MODEL_SUMMARIES",
};

export type ResolvedModel = {
  task: IntelligenceTask;
  model: string;
  source: string;
};

/**
 * Resolves the model for a SalesPilot intelligence task.
 *
 * Resolution order:
 * 1. Task-specific model, e.g. OPENAI_MODEL_STRATEGY
 * 2. OPENAI_MODEL_DEFAULT
 * 3. Legacy OPENAI_MODEL (kept for backwards compatibility)
 * 4. Cost-safe production default: gpt-5-mini
 */
export function resolveOpenAIModel(task: IntelligenceTask): ResolvedModel {
  const taskEnv = ENV_BY_TASK[task];
  const taskModel = process.env[taskEnv]?.trim();
  if (taskModel) return { task, model: taskModel, source: taskEnv };

  const defaultModel = process.env.OPENAI_MODEL_DEFAULT?.trim();
  if (defaultModel) {
    return { task, model: defaultModel, source: "OPENAI_MODEL_DEFAULT" };
  }

  const legacyModel = process.env.OPENAI_MODEL?.trim();
  if (legacyModel) {
    return { task, model: legacyModel, source: "OPENAI_MODEL" };
  }

  return { task, model: "gpt-5-mini", source: "COST_SAFE_DEFAULT" };
}

export function getConfiguredModelMap(): Record<IntelligenceTask, ResolvedModel | null> {
  return Object.fromEntries(
    intelligenceTasks.map((task) => {
      try {
        return [task, resolveOpenAIModel(task)];
      } catch {
        return [task, null];
      }
    }),
  ) as Record<IntelligenceTask, ResolvedModel | null>;
}

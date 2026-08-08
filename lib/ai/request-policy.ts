import "server-only";

export type AiRequestTask =
  | "BUSINESS_ANALYSIS"
  | "COMPANY_DISCOVERY"
  | "ROUTE_INTELLIGENCE_FIRST_PASS"
  | "ROUTE_INTELLIGENCE_EXPANSION"
  | "G5_COMMERCIAL_REASONING"
  | "G5_CHANNEL_STRATEGY"
  | "G5_OUTREACH_GENERATION"
  | "G5_SELF_REVIEW"
  | "STRUCTURED_OUTPUT_REPAIR";

const DEFAULT_TIMEOUT_MS: Record<AiRequestTask, number> = {
  BUSINESS_ANALYSIS: 150_000,
  COMPANY_DISCOVERY: 180_000,
  ROUTE_INTELLIGENCE_FIRST_PASS: 180_000,
  ROUTE_INTELLIGENCE_EXPANSION: 150_000,
  G5_COMMERCIAL_REASONING: 120_000,
  G5_CHANNEL_STRATEGY: 90_000,
  G5_OUTREACH_GENERATION: 75_000,
  G5_SELF_REVIEW: 120_000,
  STRUCTURED_OUTPUT_REPAIR: 45_000,
};

const ENV_KEYS: Record<AiRequestTask, string> = {
  BUSINESS_ANALYSIS: "SALESPILOT_AI_TIMEOUT_BUSINESS_ANALYSIS_MS",
  COMPANY_DISCOVERY: "SALESPILOT_AI_TIMEOUT_COMPANY_DISCOVERY_MS",
  ROUTE_INTELLIGENCE_FIRST_PASS: "SALESPILOT_AI_TIMEOUT_ROUTE_FIRST_PASS_MS",
  ROUTE_INTELLIGENCE_EXPANSION: "SALESPILOT_AI_TIMEOUT_ROUTE_EXPANSION_MS",
  G5_COMMERCIAL_REASONING: "SALESPILOT_AI_TIMEOUT_G5_COMMERCIAL_REASONING_MS",
  G5_CHANNEL_STRATEGY: "SALESPILOT_AI_TIMEOUT_G5_CHANNEL_STRATEGY_MS",
  G5_OUTREACH_GENERATION: "SALESPILOT_AI_TIMEOUT_G5_OUTREACH_GENERATION_MS",
  G5_SELF_REVIEW: "SALESPILOT_AI_TIMEOUT_G5_SELF_REVIEW_MS",
  STRUCTURED_OUTPUT_REPAIR: "SALESPILOT_AI_TIMEOUT_STRUCTURED_REPAIR_MS",
};

function boundedTimeout(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  // Keep every model request below the serverless hard limit while allowing
  // task-specific tuning in production without a code deployment.
  return Math.min(240_000, Math.max(15_000, Math.trunc(parsed)));
}

export function aiRequestTimeoutMs(task: AiRequestTask): number {
  return boundedTimeout(process.env[ENV_KEYS[task]], DEFAULT_TIMEOUT_MS[task]);
}

export type OpenAITransportClassification = {
  code: "TIMEOUT" | "NETWORK";
  error: Error;
};

export function classifyOpenAITransportError(
  error: unknown,
  task: AiRequestTask,
  timeoutMs: number,
): OpenAITransportClassification {
  const source = error instanceof Error ? error : new Error(String(error ?? "OpenAI request failed"));
  const name = String(source.name ?? "").toUpperCase();
  const message = String(source.message ?? "");
  const upper = message.toUpperCase();
  const isTimeout =
    name.includes("TIMEOUT") ||
    name.includes("ABORT") ||
    upper.includes("TIMEOUT") ||
    upper.includes("TIMED OUT") ||
    upper.includes("ABORT");

  if (isTimeout) {
    const wrapped = new Error(`OPENAI_TIMEOUT:${task}:${timeoutMs}ms:${message || source.name || "request timed out"}`);
    wrapped.name = "OpenAITimeoutError";
    return { code: "TIMEOUT", error: wrapped };
  }

  const wrapped = new Error(`OPENAI_NETWORK:${task}:${message || source.name || "request failed"}`);
  wrapped.name = "OpenAINetworkError";
  return { code: "NETWORK", error: wrapped };
}

export function isRetryableOpenAIHttpStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504 || status === 529;
}

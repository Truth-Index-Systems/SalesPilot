export const PIPELINE_ERROR_CODES = [
  "TIMEOUT",
  "RATE_LIMIT",
  "NETWORK",
  "INVALID_AI_OUTPUT",
  "JSON_PARSE",
  "DATABASE",
  "WORKER_INTERRUPTED",
  "WORKER_LEASE_EXPIRED",
  "NO_VERIFIED_COMPANIES",
  "NO_SUPPORTED_CONTACTS",
  "NO_COMPANY_CHANNELS",
  "CONFIGURATION",
  "AUTHENTICATION",
  "AI_GOVERNANCE_BLOCKED",
  "UNKNOWN",
] as const;

export type PipelineErrorCode = (typeof PIPELINE_ERROR_CODES)[number];

export type ClassifiedPipelineError = {
  code: PipelineErrorCode;
  message: string;
  retryable: boolean;
};

function cleanMessage(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error ?? "UNKNOWN");
  return value.replace(/[\r\n\t]+/g, " ").slice(0, 1000);
}

export function classifyPipelineError(error: unknown): ClassifiedPipelineError {
  const message = cleanMessage(error);
  const upper = message.toUpperCase();

  if (upper.includes("TIMEOUT") || upper.includes("ABORT")) return { code: "TIMEOUT", message, retryable: true };
  if (upper.includes("429") || upper.includes("RATE_LIMIT")) return { code: "RATE_LIMIT", message, retryable: true };
  if (/\b(408|425|500|502|503|504|529)\b/.test(upper) || upper.includes("SERVICE_UNAVAILABLE") || upper.includes("BAD_GATEWAY") || upper.includes("GATEWAY_TIMEOUT")) return { code: "NETWORK", message, retryable: true };
  if (upper.includes("NETWORK") || upper.includes("FETCH FAILED") || upper.includes("ECONN")) return { code: "NETWORK", message, retryable: true };
  if (upper.includes("JSON") && (upper.includes("PARSE") || upper.includes("SYNTAX"))) return { code: "JSON_PARSE", message, retryable: true };
  if (upper.includes("INVALID_AI") || upper.includes("SCHEMA") || upper.includes("STRUCTURED_OUTPUT") || upper.includes("INCOMPLETE_RESPONSE") || upper.includes("DISCOVERY_INCOMPLETE")) return { code: "INVALID_AI_OUTPUT", message, retryable: true };
  if (upper.includes("AI_GOVERNANCE_BLOCKED")) return { code: "AI_GOVERNANCE_BLOCKED", message, retryable: true };
  if (upper.includes("OPENAI_API_KEY_NOT_CONFIGURED") || upper.includes("CONFIGURATION")) return { code: "CONFIGURATION", message, retryable: false };
  if (upper.includes("AUTH") || upper.includes("UNAUTHORIZED") || upper.includes("FORBIDDEN")) return { code: "AUTHENTICATION", message, retryable: false };
  if (upper.includes("DATABASE") || upper.includes("POSTGREST") || upper.includes("PGRST")) return { code: "DATABASE", message, retryable: true };

  return { code: "UNKNOWN", message, retryable: true };
}

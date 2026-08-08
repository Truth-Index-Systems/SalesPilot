export function safePipelineFailureReason(error: unknown, fallback = "MarketRoute encountered a technical interruption and will retry safely.") {
  const code = error instanceof Error ? error.message : "";
  if (code.includes("AI_GOVERNANCE_BLOCKED")) return "AI governance paused this request before any model usage.";
  if (code.includes("INVALID_AI_OUTPUT")) return "The AI response did not complete in the required structured format; no partial result was saved.";
  if (code.includes("TIMEOUT") || code.includes("AbortError")) return "The external research request timed out and will retry safely.";
  if (code.includes("RATE_LIMIT") || code.includes("429")) return "The AI provider temporarily rate-limited this request; MarketRoute will retry safely.";
  if (code.includes("DATABASE")) return "MarketRoute could not persist this stage safely and will retry without exposing partial work.";
  return fallback;
}

import "server-only";
import { completeAiRequest, reserveAiRequest, responseUsage } from "@/lib/ai/governance";
import { resolveOpenAIModel } from "@/lib/intelligence/model-router";
import { compactForAi, stableFingerprint } from "@/lib/ai/cost-optimisation";
import { parseStructuredAiResponse, safeStructuredAiError } from "@/lib/ai/structured-response-gateway";
import { EngagementSelfReviewSchema, engagementSelfReviewJsonSchema, type EngagementSelfReview } from "./self-review-schema";

const ENDPOINT = "https://api.openai.com/v1/responses";
type Usage = { input_tokens?: number; output_tokens?: number; total_tokens?: number };

export async function reviewEngagementDraft(input: {
  organisationId: string;
  campaignId: string;
  schedulerRunId: string;
  reviewId: string;
  context: Record<string, unknown>;
}): Promise<{ result: EngagementSelfReview; model: string; usage?: Usage; durationMs: number; responseId: string | null }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY_NOT_CONFIGURED");
  const model = resolveOpenAIModel("analysis").model;
  const compactContext = compactForAi(input.context, { evidenceLimit: 4, depth: 6 }) as Record<string, unknown>;
  const fingerprint = stableFingerprint({ prompt: "self-review/v2-route-alignment", model, compactContext });
  const startedAt = Date.now();
  const reservation = await reserveAiRequest({
    organisationId: input.organisationId,
    campaignId: input.campaignId,
    schedulerRunId: input.schedulerRunId,
    jobType: "OUTREACH",
    jobId: input.reviewId,
    requestScope: `engagement-self-review:${fingerprint}`,
    model,
    estimatedCostUsd: Number(process.env.SALESPILOT_ENGAGEMENT_SELF_REVIEW_ESTIMATED_COST_USD ?? "0.04"),
  });

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(120_000),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        instructions: [
          "You are MarketRoute's independent engagement quality reviewer.",
          "Judge whether the supplied first outreach is likely to win a relevant business conversation.",
          "Review the draft against the supplied commercial analysis, recommended access route and authoritative evidence; do not add new facts.",
          "Penalise drafts that ignore the selected route, misuse the channel, overstate the recipient's authority, or fail to follow the recommended entry strategy.",
          "Penalise generic personalisation, vague value propositions, inflated claims, fake familiarity, weak CTAs, verbosity and unsupported statements.",
          "Treat factual accuracy and evidence use as hard gates. List every unsupported claim you can identify.",
          "Set approvedByAI true only when combinedScore is at least 75, factualAccuracy is at least 80, evidenceUse is at least 75, and unsupportedClaims is empty.",
          "Scores must be candid and internally consistent. Return exact JSON only.",
        ].join(" "),
        input: JSON.stringify(compactContext),
        text: { format: { type: "json_schema", name: "salespilot_engagement_self_review_v1", strict: true, schema: engagementSelfReviewJsonSchema } },
        max_output_tokens: 1600,
        store: false,
      }),
    });
  } catch (error) {
    await completeAiRequest({ ledgerId: reservation.ledgerId, ok: false, durationMs: Date.now() - startedAt, errorCode: "NETWORK", errorMessage: error instanceof Error ? error.message : "OpenAI request failed" }).catch(() => undefined);
    throw error;
  }

  const json: unknown = await response.json().catch(() => null);
  const usage = responseUsage(json);
  const responseId = typeof (json as { id?: unknown } | null)?.id === "string" ? (json as { id: string }).id : null;
  if (!response.ok) {
    await completeAiRequest({ ledgerId: reservation.ledgerId, ok: false, usage, durationMs: Date.now() - startedAt, responseId, errorCode: `HTTP_${response.status}`, errorMessage: JSON.stringify((json as { error?: unknown } | null)?.error ?? null) }).catch(() => undefined);
    throw new Error(`OPENAI_ENGAGEMENT_SELF_REVIEW_FAILED:${response.status}`);
  }

  let parsed: EngagementSelfReview;
  try {
    parsed = (await parseStructuredAiResponse({ response: json, schema: EngagementSelfReviewSchema, jsonSchema: engagementSelfReviewJsonSchema, schemaName: "salespilot_engagement_self_review_v1", apiKey, model })).value;
  } catch (error) {
    await completeAiRequest({ ledgerId: reservation.ledgerId, ok: false, usage, durationMs: Date.now() - startedAt, responseId, errorCode: safeStructuredAiError(error).code, errorMessage: safeStructuredAiError(error).message }).catch(() => undefined);
    throw error;
  }

  const approvedByPolicy = parsed.combinedScore >= 75 && parsed.factualAccuracy >= 80 && parsed.evidenceUse >= 75 && parsed.unsupportedClaims.length === 0;
  const result = { ...parsed, approvedByAI: approvedByPolicy };
  const durationMs = Date.now() - startedAt;
  await completeAiRequest({ ledgerId: reservation.ledgerId, ok: true, usage, durationMs, responseId });
  return { result, model, usage, durationMs, responseId };
}

import "server-only";
import { completeAiRequest, reserveAiRequest, responseUsage } from "@/lib/ai/governance";
import { resolveOpenAIModel } from "@/lib/intelligence/model-router";
import { EngagementSelfReviewSchema, engagementSelfReviewJsonSchema, type EngagementSelfReview } from "./self-review-schema";

const ENDPOINT = "https://api.openai.com/v1/responses";
type Usage = { input_tokens?: number; output_tokens?: number; total_tokens?: number };

function outputText(value: unknown) {
  const data = value as { output_text?: unknown; output?: Array<{ content?: Array<{ text?: unknown }> }> };
  if (typeof data.output_text === "string" && data.output_text) return data.output_text;
  for (const item of data.output ?? []) for (const part of item.content ?? []) if (typeof part.text === "string") return part.text;
  throw new Error("ENGAGEMENT_SELF_REVIEW_RESPONSE_EMPTY");
}

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
  const startedAt = Date.now();
  const reservation = await reserveAiRequest({
    organisationId: input.organisationId,
    campaignId: input.campaignId,
    schedulerRunId: input.schedulerRunId,
    jobType: "OUTREACH",
    jobId: input.reviewId,
    requestScope: `engagement-self-review:${input.reviewId}`,
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
          "You are SalesPilot's independent engagement quality reviewer.",
          "Judge whether the supplied first outreach is likely to win a relevant business conversation.",
          "Review the draft against the supplied commercial analysis and authoritative evidence; do not add new facts.",
          "Penalise generic personalisation, vague value propositions, inflated claims, fake familiarity, weak CTAs, verbosity and unsupported statements.",
          "Treat factual accuracy and evidence use as hard gates. List every unsupported claim you can identify.",
          "Set approvedByAI true only when combinedScore is at least 75, factualAccuracy is at least 80, evidenceUse is at least 75, and unsupportedClaims is empty.",
          "Scores must be candid and internally consistent. Return exact JSON only.",
        ].join(" "),
        input: JSON.stringify(input.context),
        text: { format: { type: "json_schema", name: "salespilot_engagement_self_review_v1", strict: true, schema: engagementSelfReviewJsonSchema } },
        max_output_tokens: 3000,
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
    parsed = EngagementSelfReviewSchema.parse(JSON.parse(outputText(json)));
  } catch (error) {
    await completeAiRequest({ ledgerId: reservation.ledgerId, ok: false, usage, durationMs: Date.now() - startedAt, responseId, errorCode: "INVALID_STRUCTURED_OUTPUT", errorMessage: error instanceof Error ? error.message : "Invalid output" }).catch(() => undefined);
    throw error;
  }

  const approvedByPolicy = parsed.combinedScore >= 75 && parsed.factualAccuracy >= 80 && parsed.evidenceUse >= 75 && parsed.unsupportedClaims.length === 0;
  const result = { ...parsed, approvedByAI: approvedByPolicy };
  const durationMs = Date.now() - startedAt;
  await completeAiRequest({ ledgerId: reservation.ledgerId, ok: true, usage, durationMs, responseId });
  return { result, model, usage, durationMs, responseId };
}

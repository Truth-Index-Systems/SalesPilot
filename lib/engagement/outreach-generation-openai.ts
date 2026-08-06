import "server-only";
import { completeAiRequest, reserveAiRequest, responseUsage } from "@/lib/ai/governance";
import { resolveOpenAIModel } from "@/lib/intelligence/model-router";
import { OutreachGenerationSchema, outreachGenerationJsonSchema, type OutreachGeneration } from "./outreach-generation-schema";

const ENDPOINT = "https://api.openai.com/v1/responses";

type Usage = { input_tokens?: number; output_tokens?: number; total_tokens?: number };

function outputText(value: unknown) {
  const data = value as { output_text?: unknown; output?: Array<{ content?: Array<{ text?: unknown }> }> };
  if (typeof data.output_text === "string" && data.output_text) return data.output_text;
  for (const item of data.output ?? []) for (const part of item.content ?? []) if (typeof part.text === "string") return part.text;
  throw new Error("OUTREACH_GENERATION_RESPONSE_EMPTY");
}

export async function generateOutreach(input: {
  organisationId: string;
  campaignId: string;
  schedulerRunId: string;
  draftId: string;
  context: Record<string, unknown>;
}): Promise<{ result: OutreachGeneration; model: string; usage?: Usage; durationMs: number; responseId: string | null }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY_NOT_CONFIGURED");
  const model = resolveOpenAIModel("analysis").model;
  const startedAt = Date.now();
  const reservation = await reserveAiRequest({
    organisationId: input.organisationId,
    campaignId: input.campaignId,
    schedulerRunId: input.schedulerRunId,
    jobType: "OUTREACH",
    jobId: input.draftId,
    requestScope: `outreach-generation:${input.draftId}`,
    model,
    estimatedCostUsd: Number(process.env.SALESPILOT_OUTREACH_GENERATION_ESTIMATED_COST_USD ?? "0.06"),
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
          "You are SalesPilot Engagement Intelligence, writing the first outreach for an exceptional enterprise salesperson.",
          "Your objective is to win a relevant business conversation, not to summarise research or force a sale.",
          "Use the completed commercial analysis as the messaging strategy and use only facts and evidence supplied in the input.",
          "Never invent company facts, personal information, initiatives, budgets, relationships, urgency, results or familiarity.",
          "Personalisation must be meaningful and commercially relevant. Do not use superficial praise, generic compliments or fake familiarity.",
          "Keep the message concise, calm and professional in British English. The CTA must be low-friction and specific.",
          "Every factual claim used as supporting evidence must reference an exact source ID supplied in the context. Do not create IDs.",
          "State uncertainty in limitations rather than disguising assumptions as facts.",
          "Return exact JSON only. Do not include greetings, sign-offs or sender details outside the structured fields.",
        ].join(" "),
        input: JSON.stringify(input.context),
        text: { format: { type: "json_schema", name: "salespilot_outreach_generation_v1", strict: true, schema: outreachGenerationJsonSchema } },
        max_output_tokens: 4000,
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
    throw new Error(`OPENAI_OUTREACH_GENERATION_FAILED:${response.status}`);
  }

  let parsed: OutreachGeneration;
  try {
    parsed = OutreachGenerationSchema.parse(JSON.parse(outputText(json)));
  } catch (error) {
    await completeAiRequest({ ledgerId: reservation.ledgerId, ok: false, usage, durationMs: Date.now() - startedAt, responseId, errorCode: "INVALID_STRUCTURED_OUTPUT", errorMessage: error instanceof Error ? error.message : "Invalid output" }).catch(() => undefined);
    throw error;
  }

  const durationMs = Date.now() - startedAt;
  await completeAiRequest({ ledgerId: reservation.ledgerId, ok: true, usage, durationMs, responseId });
  return { result: parsed, model, usage, durationMs, responseId };
}

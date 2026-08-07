import "server-only";
import { completeAiRequest, reserveAiRequest, responseUsage } from "@/lib/ai/governance";
import { compactForAi, stableFingerprint } from "@/lib/ai/cost-optimisation";
import { parseStructuredAiResponse, safeStructuredAiError } from "@/lib/ai/structured-response-gateway";
import { resolveOpenAIModel } from "@/lib/intelligence/model-router";
import {
  G5CommercialReasoningSchema,
  g5CommercialReasoningJsonSchema,
  type G5CommercialReasoning,
} from "./g5-commercial-reasoning-schema";

const ENDPOINT = "https://api.openai.com/v1/responses";

export async function generateG5CommercialReasoning(input: {
  organisationId: string;
  campaignId: string;
  schedulerRunId: string;
  strategyId: string;
  context: Record<string, unknown>;
}): Promise<{ result: G5CommercialReasoning; model: string; sourceFingerprint: string; sourceSnapshot: Record<string, unknown> }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY_NOT_CONFIGURED");

  const model = resolveOpenAIModel("analysis").model;
  const compactContext = compactForAi(input.context, { evidenceLimit: 8, depth: 7 }) as Record<string, unknown>;
  const sourceFingerprint = stableFingerprint(compactContext);
  const requestFingerprint = stableFingerprint({ prompt: "g5-commercial-reasoning/v1", model, sourceFingerprint });
  const startedAt = Date.now();

  const reservation = await reserveAiRequest({
    organisationId: input.organisationId,
    campaignId: input.campaignId,
    schedulerRunId: input.schedulerRunId,
    jobType: "G5_COMMERCIAL_REASONING",
    jobId: input.strategyId,
    requestScope: `g5-commercial-reasoning:${requestFingerprint}`,
    model,
    estimatedCostUsd: Number(process.env.SALESPILOT_COMMERCIAL_REASONING_ESTIMATED_COST_USD ?? "0.08"),
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
          "You are SalesPilot Genesis G5 Commercial Reasoning Intelligence.",
          "G4 is immutable commercial truth. Consume the supplied approved opportunity, business DNA, campaign strategy, company evidence, contact evidence, route intelligence, buying paths and commercial routes. Never rediscover, overwrite or contradict them.",
          "Your job is to construct the factual commercial argument that later channel strategy and outreach generation will consume. Do not write an email, LinkedIn message, phone script or switchboard script.",
          "Answer: why this company, why this route, why now, what problem is credibly relevant, what commercial consequence follows, what outcome can credibly be offered, what evidence is safe to reference, what must not be claimed, the likely objection, and the smallest reasonable next commitment.",
          "Treat route intelligence as authoritative. Do not invent a new contact, route, channel, buying path or company fact.",
          "Only source IDs present in the input may appear in safeEvidence. If an assertion is commercially plausible but not verified, put it in commercialInferences or limitations rather than safeEvidence.",
          "whyNow must not fabricate urgency. If no verified trigger exists, explicitly frame timing as strategic relevance rather than a time-sensitive event.",
          "prohibitedClaims must capture tempting statements the later generator must avoid because G4 does not support them.",
          "Use calm, concise British English. Return exact JSON only.",
        ].join(" "),
        input: JSON.stringify(compactContext),
        text: { format: { type: "json_schema", name: "salespilot_g5_commercial_reasoning_v1", strict: true, schema: g5CommercialReasoningJsonSchema } },
        max_output_tokens: 2800,
        store: false,
      }),
    });
  } catch (error) {
    await completeAiRequest({
      ledgerId: reservation.ledgerId, ok: false, durationMs: Date.now() - startedAt,
      errorCode: "NETWORK", errorMessage: error instanceof Error ? error.message : "OpenAI request failed",
    }).catch(() => undefined);
    throw error;
  }

  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    await completeAiRequest({
      ledgerId: reservation.ledgerId, ok: false, usage: responseUsage(json), durationMs: Date.now() - startedAt,
      responseId: typeof (json as any)?.id === "string" ? (json as any).id : null,
      errorCode: `HTTP_${response.status}`, errorMessage: JSON.stringify((json as any)?.error ?? null),
    }).catch(() => undefined);
    throw new Error(`OPENAI_G5_COMMERCIAL_REASONING_FAILED:${response.status}`);
  }

  let parsed: G5CommercialReasoning;
  try {
    parsed = (await parseStructuredAiResponse({
      response: json,
      schema: G5CommercialReasoningSchema,
      jsonSchema: g5CommercialReasoningJsonSchema,
      schemaName: "salespilot_g5_commercial_reasoning_v1",
      apiKey,
      model,
    })).value;
  } catch (error) {
    const safe = safeStructuredAiError(error);
    await completeAiRequest({
      ledgerId: reservation.ledgerId, ok: false, usage: responseUsage(json), durationMs: Date.now() - startedAt,
      errorCode: safe.code, errorMessage: safe.message,
    }).catch(() => undefined);
    throw error;
  }

  await completeAiRequest({
    ledgerId: reservation.ledgerId, ok: true, usage: responseUsage(json), durationMs: Date.now() - startedAt,
    responseId: typeof (json as any)?.id === "string" ? (json as any).id : null,
  });

  return { result: parsed, model, sourceFingerprint, sourceSnapshot: compactContext };
}

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
  const requestFingerprint = stableFingerprint({ prompt: "g5-commercial-reasoning/v2-executive-deal-strategy", model, sourceFingerprint });
  const startedAt = Date.now();

  const reservation = await reserveAiRequest({
    organisationId: input.organisationId,
    campaignId: input.campaignId,
    schedulerRunId: input.schedulerRunId,
    jobType: "COMMERCIAL_REASONING",
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
          "ROLE: Chief Revenue Officer / Executive Deal Strategist for SalesPilot.",
          "MISSION: Determine the strongest truthful reason this specific buyer organisation should care enough to continue a commercial conversation. You are not writing outreach; you are preparing the deal thesis that every downstream action must inherit.",
          "EXECUTIVE ACCOUNTABILITY: Convert immutable G4 truth into a concise commercial case covering company relevance, route relevance, timing, likely problem, plausible consequence, credible outcome, buyer concern, objection and smallest sensible next commitment.",
          "DECISION STANDARD: Ask 'Why should this prospect spend any attention on us now?' and separately 'What do we still need to learn before we deserve to ask for anything larger?' Cold outreach sells the next conversation, not the product.",
          "REASONING CHAIN: observed condition -> plausible operational implication -> plausible commercial consequence -> why the seller may be relevant -> what remains unknown -> what next conversation would validate. Never collapse an implication into a known fact.",
          "REASON-TO-REPLY TEST: Produce a commercial thesis that gives the recipient a rational reason to reply even if they are not currently ready to buy. Useful clarification, ownership confirmation or relevance testing can be a valid next commitment.",
          "G4 is immutable commercial truth. Consume the approved opportunity, Business DNA, campaign strategy, company/contact evidence, route intelligence, buying paths and commercial routes. Never rediscover, overwrite or contradict them.",
          "Treat route intelligence as authoritative. Never invent a new person, route, channel, buying path, relationship, budget, trigger or company fact.",
          "KNOWN vs INFERRED vs UNKNOWN: only source-supported assertions belong in safeEvidence. Commercially plausible interpretations belong in commercialInferences. Unsupported gaps belong in limitations. Never let an inference masquerade as observation.",
          "whyNow must never manufacture urgency. If there is no verified trigger, frame timing as enduring strategic relevance or a sensible hypothesis to test.",
          "prohibitedClaims must include tempting statements a salesperson might make but G4 cannot support, including unsupported pain, ROI, incumbent dissatisfaction, budget, urgency, growth or results.",
          "FALSIFICATION: Challenge your own thesis once. Ask what strongest fact or uncertainty would make this a weak reason to engage and ensure that risk appears in limitations/inferences rather than being hidden.",
          "Do not write an email, LinkedIn message, phone script, subject line or switchboard script.",
          "Write calm, concise British English. Return exact JSON only. Set promptVersion to g5-commercial-reasoning/v2-executive-deal-strategy.",
        ].join(" "),
        input: JSON.stringify(compactContext),
        reasoning: { effort: "high" },
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

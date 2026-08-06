import "server-only";
import { completeAiRequest, reserveAiRequest, responseUsage } from "@/lib/ai/governance";
import { resolveOpenAIModel } from "@/lib/intelligence/model-router";
import { compactForAi, stableFingerprint } from "@/lib/ai/cost-optimisation";
import { parseStructuredAiResponse, safeStructuredAiError } from "@/lib/ai/structured-response-gateway";
import { OutreachGenerationSchema, outreachGenerationJsonSchema, type OutreachGeneration } from "./outreach-generation-schema";

const ENDPOINT = "https://api.openai.com/v1/responses";

type Usage = { input_tokens?: number; output_tokens?: number; total_tokens?: number };

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
  const compactContext = compactForAi(input.context, { evidenceLimit: 4, depth: 6 }) as Record<string, unknown>;
  const fingerprint = stableFingerprint({ prompt: "engagement-channel-content/v1", model, compactContext });
  const startedAt = Date.now();
  const reservation = await reserveAiRequest({
    organisationId: input.organisationId,
    campaignId: input.campaignId,
    schedulerRunId: input.schedulerRunId,
    jobType: "OUTREACH",
    jobId: input.draftId,
    requestScope: `channel-content-generation:${fingerprint}`,
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
          "You are SalesPilot Channel-Aware Engagement Intelligence.",
          "Use the primaryChannel in the engagement strategy as the authoritative output channel. Never silently convert a non-email route into email.",
          "Generate native content for that channel and set every irrelevant content field to null or an empty array.",
          "EMAIL: provide a concise subject and complete emailBody with a bespoke opener, value, and low-friction CTA.",
          "LINKEDIN: provide a connectionRequest when useful, a short directMessage, and a restrained followUpMessage. Do not use email formatting or a subject.",
          "WEBSITE_FORM: provide formSubject when appropriate and formMessage written to be pasted into the organisation contact form. executionInstruction must tell the user to paste it into the contact form using their connected business email.",
          "PHONE: provide a callOpening, focused discoveryQuestions, and practical objectionResponses.",
          "REFERRAL, EXISTING_CUSTOMER, PARTNER, INTERNAL_CHAMPION, or EXECUTIVE_ASSISTANT: provide referralRequest and introductionMessage designed to earn the correct introduction.",
          "PROCUREMENT: provide procurementIntroduction and qualificationSummary without pretending procurement owns the operational need.",
          "Use the completed commercial analysis, entry strategy, route evidence and only supplied facts. Never invent details, familiarity, results, budgets or relationships.",
          "Where the route is indirect, seek an introduction or escalation rather than treating the recipient as the final buyer.",
          "Keep content concise, calm, specific and professional in British English.",
          "Every supporting factual claim must reference an exact source ID supplied in context.",
          "Return exact JSON only.",
        ].join(" "),
        input: JSON.stringify(compactContext),
        text: { format: { type: "json_schema", name: "salespilot_channel_content_v1", strict: true, schema: outreachGenerationJsonSchema } },
        max_output_tokens: 1800,
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
    parsed = (await parseStructuredAiResponse({ response: json, schema: OutreachGenerationSchema, jsonSchema: outreachGenerationJsonSchema, schemaName: "salespilot_channel_content_v1", apiKey, model })).value;
    const strategyChannel = String(((compactContext.engagement as Record<string, unknown> | undefined)?.primaryChannel) ?? "").toUpperCase();
    if (strategyChannel && parsed.channel !== strategyChannel) throw new Error(`CHANNEL_STRATEGY_MISMATCH:${strategyChannel}:${parsed.channel}`);
    const c = parsed.content;
    const valid = parsed.channel === "EMAIL" ? Boolean(c.subject && c.emailBody)
      : parsed.channel === "LINKEDIN" ? Boolean(c.directMessage)
      : parsed.channel === "WEBSITE_FORM" ? Boolean(c.formMessage)
      : parsed.channel === "PHONE" ? Boolean(c.callOpening)
      : parsed.channel === "PROCUREMENT" ? Boolean(c.procurementIntroduction)
      : Boolean(c.referralRequest || c.introductionMessage);
    if (!valid) throw new Error(`CHANNEL_CONTENT_MISSING:${parsed.channel}`);
  } catch (error) {
    await completeAiRequest({ ledgerId: reservation.ledgerId, ok: false, usage, durationMs: Date.now() - startedAt, responseId, errorCode: safeStructuredAiError(error).code, errorMessage: safeStructuredAiError(error).message }).catch(() => undefined);
    throw error;
  }

  const durationMs = Date.now() - startedAt;
  await completeAiRequest({ ledgerId: reservation.ledgerId, ok: true, usage, durationMs, responseId });
  return { result: parsed, model, usage, durationMs, responseId };
}

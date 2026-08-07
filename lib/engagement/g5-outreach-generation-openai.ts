import "server-only";
import { completeAiRequest, reserveAiRequest, responseUsage } from "@/lib/ai/governance";
import { compactForAi, stableFingerprint } from "@/lib/ai/cost-optimisation";
import { parseStructuredAiResponse, safeStructuredAiError } from "@/lib/ai/structured-response-gateway";
import { resolveOpenAIModel } from "@/lib/intelligence/model-router";
import {
  G5OutreachGenerationSchema,
  g5OutreachGenerationJsonSchema,
  type G5OutreachGeneration,
} from "./g5-outreach-generation-schema";

const ENDPOINT = "https://api.openai.com/v1/responses";

type RouteTruth = { id?: unknown; channelType?: unknown; channelValue?: unknown; isViable?: unknown };
type PrimaryDecision = { routeId?: unknown; executionChannel?: unknown };

const CHANNEL_COMPATIBILITY: Record<string, G5OutreachGeneration["channel"] | null> = {
  DIRECT_EMAIL: "EMAIL",
  DEPARTMENT_EMAIL: "EMAIL",
  GENERAL_EMAIL: "EMAIL",
  LINKEDIN: "LINKEDIN",
  SWITCHBOARD: "SWITCHBOARD",
  INTRODUCTION: "REFERRAL",
  UNKNOWN: null,
};

function primaryDecision(channelStrategy: Record<string, unknown>): { routeId: string; channel: G5OutreachGeneration["channel"] } {
  const primary = channelStrategy.primary as PrimaryDecision | undefined;
  if (!primary || typeof primary.routeId !== "string" || typeof primary.executionChannel !== "string") {
    throw new Error("G5_OUTREACH_PRIMARY_CHANNEL_MISSING");
  }
  if (!["EMAIL", "LINKEDIN", "SWITCHBOARD", "REFERRAL"].includes(primary.executionChannel)) {
    throw new Error("G5_OUTREACH_PRIMARY_CHANNEL_UNSUPPORTED");
  }
  return { routeId: primary.routeId, channel: primary.executionChannel as G5OutreachGeneration["channel"] };
}

function routeById(sourceSnapshot: Record<string, unknown>, routeId: string): RouteTruth | null {
  const opportunity = sourceSnapshot.opportunity as Record<string, unknown> | undefined;
  const routes = Array.isArray(opportunity?.commercial_routes) ? opportunity.commercial_routes : [];
  for (const value of routes) {
    if (!value || typeof value !== "object") continue;
    const route = value as RouteTruth;
    if (route.id === routeId) return route;
  }
  return null;
}

function validateNativeContent(result: G5OutreachGeneration): void {
  const c = result.content;
  if (result.channel === "EMAIL" && !(c.subject && c.emailBody)) throw new Error("G5_OUTREACH_EMAIL_CONTENT_MISSING");
  if (result.channel === "LINKEDIN" && !c.linkedinMessage) throw new Error("G5_OUTREACH_LINKEDIN_CONTENT_MISSING");
  if (result.channel === "SWITCHBOARD" && !(c.switchboardOpening && c.switchboardRoutingRequest)) throw new Error("G5_OUTREACH_SWITCHBOARD_CONTENT_MISSING");
  if (result.channel === "REFERRAL" && !(c.referralRequest && c.referralForwardableNote)) throw new Error("G5_OUTREACH_REFERRAL_CONTENT_MISSING");
}

function validateAgainstImmutableDecision(input: {
  result: G5OutreachGeneration;
  channelStrategy: Record<string, unknown>;
  sourceSnapshot: Record<string, unknown>;
}): void {
  const primary = primaryDecision(input.channelStrategy);
  if (input.result.routeId !== primary.routeId) throw new Error("G5_OUTREACH_ROUTE_MISMATCH");
  if (input.result.channel !== primary.channel) throw new Error("G5_OUTREACH_CHANNEL_MISMATCH");
  const route = routeById(input.sourceSnapshot, primary.routeId);
  if (!route) throw new Error("G5_OUTREACH_G4_ROUTE_MISSING");
  if (route.isViable !== true) throw new Error("G5_OUTREACH_G4_ROUTE_NOT_VIABLE");
  if (typeof route.channelValue !== "string" || route.channelValue.trim().length === 0) throw new Error("G5_OUTREACH_G4_ROUTE_UNREACHABLE");
  const expected = typeof route.channelType === "string" ? CHANNEL_COMPATIBILITY[route.channelType] : null;
  if (!expected || expected !== primary.channel) throw new Error("G5_OUTREACH_G4_CHANNEL_MISMATCH");
  const immutableSourceText = JSON.stringify(input.sourceSnapshot);
  for (const evidence of input.result.evidenceUsed) {
    if (!immutableSourceText.includes(evidence.sourceId)) throw new Error("G5_OUTREACH_UNKNOWN_EVIDENCE_SOURCE");
  }
  validateNativeContent(input.result);
}

export async function generateG5Outreach(input: {
  organisationId: string;
  campaignId: string;
  schedulerRunId: string;
  strategyId: string;
  commercialReasoning: Record<string, unknown>;
  channelStrategy: Record<string, unknown>;
  sourceSnapshot: Record<string, unknown>;
}): Promise<{ result: G5OutreachGeneration; model: string; sourceFingerprint: string }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY_NOT_CONFIGURED");

  const model = resolveOpenAIModel("analysis").model;
  const compactInput = compactForAi({
    commercialReasoning: input.commercialReasoning,
    channelStrategy: input.channelStrategy,
    immutableG4: input.sourceSnapshot,
  }, { evidenceLimit: 8, depth: 8 }) as Record<string, unknown>;
  const sourceFingerprint = stableFingerprint(compactInput);
  const requestFingerprint = stableFingerprint({ prompt: "g5-outreach-generation/v1", model, sourceFingerprint });
  const startedAt = Date.now();
  const reservation = await reserveAiRequest({
    organisationId: input.organisationId,
    campaignId: input.campaignId,
    schedulerRunId: input.schedulerRunId,
    jobType: "OUTREACH",
    jobId: input.strategyId,
    requestScope: `g5-outreach-generation:${requestFingerprint}`,
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
          "You are SalesPilot G5 Channel-Specific Outreach Generation.",
          "G4 commercial truth is immutable. Never research, rediscover, alter or invent a route, contact, fact, pain, result, budget, relationship or timing claim.",
          "The channelStrategy.primary routeId and executionChannel are authoritative. Generate only for that primary route and channel.",
          "Commercial reasoning is the factual spine. Respect every prohibited claim and limitation it contains.",
          "Use only supplied verified facts and safe commercial inferences. Do not turn an inference into a factual statement.",
          "EMAIL: concise subject and complete emailBody. No 'I hope this email finds you well', fake familiarity or bloated pitch. Use a low-friction CTA.",
          "LINKEDIN: native conversational message, materially shorter than email. A connection note is optional. No subject line or email formatting.",
          "SWITCHBOARD: produce a practical spoken opening and routing request whose purpose is to reach the correct operational/commercial owner. Do not pitch the receptionist as the buyer.",
          "REFERRAL: ask for the correct introduction and provide a short forwardable note. Do not pretend the referrer is the buyer.",
          "Set every content field irrelevant to the selected channel to null.",
          "evidenceUsed must cite source IDs that actually appear in the supplied immutable G4 context. Do not fabricate source IDs.",
          "Write in concise professional British English. Return exact JSON only.",
        ].join(" "),
        input: JSON.stringify(compactInput),
        text: { format: { type: "json_schema", name: "salespilot_g5_outreach_generation_v1", strict: true, schema: g5OutreachGenerationJsonSchema } },
        max_output_tokens: 1900,
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
    throw new Error(`OPENAI_G5_OUTREACH_GENERATION_FAILED:${response.status}`);
  }

  let parsed: G5OutreachGeneration;
  try {
    parsed = (await parseStructuredAiResponse({ response: json, schema: G5OutreachGenerationSchema, jsonSchema: g5OutreachGenerationJsonSchema, schemaName: "salespilot_g5_outreach_generation_v1", apiKey, model })).value;
    validateAgainstImmutableDecision({ result: parsed, channelStrategy: input.channelStrategy, sourceSnapshot: input.sourceSnapshot });
  } catch (error) {
    const safe = safeStructuredAiError(error);
    await completeAiRequest({ ledgerId: reservation.ledgerId, ok: false, usage, durationMs: Date.now() - startedAt, responseId, errorCode: safe.code, errorMessage: safe.message }).catch(() => undefined);
    throw error;
  }

  await completeAiRequest({ ledgerId: reservation.ledgerId, ok: true, usage, durationMs: Date.now() - startedAt, responseId });
  return { result: parsed, model, sourceFingerprint };
}

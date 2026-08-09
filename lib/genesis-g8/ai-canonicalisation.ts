import "server-only";

import type { AiJobType } from "@/lib/ai/governance";
import { completeAiRequest, reserveAiRequest, responseUsage } from "@/lib/ai/governance";
import { fetchResumableOpenAIResponse, isOpenAIBackgroundPending, isOpenAIBackgroundTerminal } from "@/lib/ai/background-response";
import type { AiRequestTask } from "@/lib/ai/request-policy";
import { stableFingerprint } from "@/lib/ai/cost-optimisation";

export type HardAcceptance<T> = {
  value: T | null;
  issues: string[];
};

export function extractAiOutputText(value: unknown): string {
  const row = value as { output_text?: unknown; output?: Array<{ content?: Array<{ text?: unknown }> }> };
  if (typeof row?.output_text === "string" && row.output_text.trim()) return row.output_text.trim();
  for (const item of row?.output ?? []) {
    for (const part of item.content ?? []) {
      if (typeof part.text === "string" && part.text.trim()) return part.text.trim();
    }
  }
  throw new Error("AI_OUTPUT_TEXT_MISSING");
}

export function decodeAiJson(value: unknown): unknown {
  const text = extractAiOutputText(value);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("AI_OUTPUT_JSON_INVALID");
  }
}

/**
 * AI owns semantic canonicalisation. This function deliberately contains no JSON repair,
 * field coercion, alias mapping, score scaling, prose interpretation or deterministic
 * normalisation. It sends the research output back to the model with the canonical schema.
 * Local code only performs the caller-provided hard acceptance gate afterwards.
 */
export async function canonicaliseWithAi<T>(params: {
  apiKey: string;
  model: string;
  organisationId: string | null;
  campaignId?: string | null;
  jobType: AiJobType;
  task: AiRequestTask;
  jobId: string;
  parentScope: string;
  rawResponse: unknown;
  schemaName: string;
  jsonSchema: unknown;
  instructions: string;
  accept: (value: unknown) => HardAcceptance<T>;
  estimatedCostUsd?: number;
}): Promise<T> {
  const sourceText = extractAiOutputText(params.rawResponse);
  const scope = `${params.parentScope}:ai-canonicalise-v1:${stableFingerprint({ schemaName: params.schemaName, sourceText })}`;
  const reservation = await reserveAiRequest({
    organisationId: params.organisationId,
    campaignId: params.campaignId ?? null,
    jobType: params.jobType,
    jobId: params.jobId,
    requestScope: scope,
    model: params.model,
    estimatedCostUsd: Math.max(0.002, params.estimatedCostUsd ?? 0.01),
  });
  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetchResumableOpenAIResponse({
      apiKey: params.apiKey,
      task: params.task,
      organisationId: params.organisationId,
      campaignId: params.campaignId ?? null,
      jobType: params.jobType,
      jobId: params.jobId,
      requestScope: scope,
      model: params.model,
      ledgerId: reservation.ledgerId,
    }, {
      method: "POST",
      cache: "no-store",
      headers: { Authorization: `Bearer ${params.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: params.model,
        instructions: [
          "ROLE: Canonical data editor for MarketRoute.",
          "TASK: Convert the supplied research output into the exact canonical JSON contract provided by the response schema.",
          "SEMANTIC AUTHORITY: You may resolve harmless naming, shape, nullability, field-placement, wording and formatting inconsistencies using the meaning already present in the supplied output.",
          "NO NEW RESEARCH: Do not browse and do not invent facts, sources, companies, claims or evidence. Preserve the meaning and provenance of the supplied research only.",
          "MISSING DATA: Use null or empty arrays exactly where the canonical contract permits. Never manufacture values merely to satisfy a field.",
          "NUMERIC CONTRACT: Preserve primitive scores in the scale required by the canonical schema. Do not calculate Truth Index or any MR-TI-2 derived value.",
          params.instructions,
          "Return only canonical JSON matching the supplied schema.",
        ].join("\n\n"),
        input: sourceText,
        reasoning: { effort: "low" },
        text: { format: { type: "json_schema", name: params.schemaName, strict: true, schema: params.jsonSchema } },
        max_output_tokens: 4_000,
        store: false,
      }),
    });
  } catch (error) {
    if (isOpenAIBackgroundPending(error)) throw error;
    if (isOpenAIBackgroundTerminal(error)) {
      await completeAiRequest({ ledgerId: reservation.ledgerId, ok: false, durationMs: Date.now() - startedAt, responseId: error.responseId, errorCode: `AI_CANONICALISATION_${error.status.toUpperCase()}`, errorMessage: error.providerReason ?? error.message }).catch(() => undefined);
    }
    throw error;
  }

  const json: unknown = await response.json().catch(() => null);
  const responseId = typeof (json as { id?: unknown })?.id === "string" ? String((json as { id: string }).id) : null;
  if (!response.ok) {
    await completeAiRequest({ ledgerId: reservation.ledgerId, ok: false, usage: responseUsage(json), durationMs: Date.now() - startedAt, responseId, errorCode: `AI_CANONICALISATION_HTTP_${response.status}`, errorMessage: "AI canonicalisation request failed" }).catch(() => undefined);
    throw new Error(`AI_CANONICALISATION_HTTP_${response.status}`);
  }

  let decoded: unknown;
  try {
    decoded = decodeAiJson(json);
  } catch (error) {
    await completeAiRequest({ ledgerId: reservation.ledgerId, ok: false, usage: responseUsage(json), durationMs: Date.now() - startedAt, responseId, errorCode: "AI_CANONICALISATION_JSON_INVALID", errorMessage: error instanceof Error ? error.message : "invalid JSON" }).catch(() => undefined);
    throw error;
  }
  const accepted = params.accept(decoded);
  if (!accepted.value) {
    await completeAiRequest({ ledgerId: reservation.ledgerId, ok: false, usage: responseUsage(json), durationMs: Date.now() - startedAt, responseId, errorCode: "AI_CANONICALISATION_HARD_GATE", errorMessage: accepted.issues.slice(0, 8).join(" | ") }).catch(() => undefined);
    throw new Error(`AI_CANONICALISATION_HARD_GATE:${accepted.issues.slice(0, 8).join("|")}`);
  }
  await completeAiRequest({ ledgerId: reservation.ledgerId, ok: true, usage: responseUsage(json), durationMs: Date.now() - startedAt, responseId });
  return accepted.value;
}

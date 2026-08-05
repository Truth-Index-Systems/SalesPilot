import { AiEnvelopeSchema, type AiEnvelope } from "@/lib/ai/contracts";
import { BusinessDnaPayloadSchema, type BusinessDnaPayload } from "@/lib/ai/schemas/business-dna";
import { businessDiscoveryJsonSchema } from "@/lib/intelligence/business-discovery-schema";
import type { WebsiteSource } from "@/lib/intelligence/website-reader";
import { resolveOpenAIModel } from "@/lib/intelligence/model-router";
import { completeAiRequest, reserveAiRequest, responseUsage } from "@/lib/ai/governance";

const ENDPOINT = "https://api.openai.com/v1/responses";
const envelopeSchema = AiEnvelopeSchema(BusinessDnaPayloadSchema);

function getConfig() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");

  const resolved = resolveOpenAIModel("strategy");
  return { apiKey, model: resolved.model, modelSource: resolved.source };
}

function extractOutputText(response: unknown): string {
  if (!response || typeof response !== "object") throw new Error("OpenAI returned an invalid response.");
  const data = response as { output_text?: unknown; output?: unknown };
  if (typeof data.output_text === "string" && data.output_text.trim()) return data.output_text;
  if (Array.isArray(data.output)) {
    for (const item of data.output) {
      if (!item || typeof item !== "object") continue;
      const content = (item as { content?: unknown }).content;
      if (!Array.isArray(content)) continue;
      for (const part of content) {
        if (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string") return (part as { text: string }).text;
      }
    }
  }
  throw new Error("OpenAI returned no structured output.");
}

export async function analyseBusiness(params: { organisationId:string|null; jobId:string; website: string; sources: WebsiteSource[] }): Promise<AiEnvelope<BusinessDnaPayload>> {
  const { apiKey, model } = getConfig();
  const sourceBlock = params.sources.map((source, index) => `SOURCE ${index + 1}\nURL: ${source.url}\nTITLE: ${source.title}\nCONTENT: ${source.text}`).join("\n\n");
  const now = new Date().toISOString();
  const instructions = `You are SalesPilot Intelligence. Analyse a B2B company's own website and propose commercially useful outbound strategies.\n\nRules:\n- Use only the supplied source material for factual claims about the company.\n- Clearly list unknowns instead of inventing facts.\n- Inferences about ideal customers and campaigns are allowed, but must be labelled through confidence, why and risks.\n- Avoid guaranteed revenue, meeting or lead claims.\n- Write concise, calm British English.\n- Return the exact JSON schema only.\n- Set schemaVersion to business-dna/v1 and promptVersion to business-discovery/v1.\n- Set model to ${model} and generatedAt to ${now}.\n- Use the canonical website ${params.website}.`;

  const body = {
    model,
    instructions,
    input: sourceBlock,
    text: {
      format: {
        type: "json_schema",
        name: "salespilot_business_discovery",
        description: "Evidence-backed Business DNA and initial outbound campaign proposals.",
        strict: true,
        schema: businessDiscoveryJsonSchema,
      },
    },
    max_output_tokens: 7000,
    store: false,
  };

  const reservation = await reserveAiRequest({ organisationId: params.organisationId, jobType: "BUSINESS_ANALYSIS", jobId: params.jobId, requestScope: `business-analysis:${params.jobId}`, model, estimatedCostUsd: Number(process.env.SALESPILOT_BUSINESS_ANALYSIS_ESTIMATED_COST_USD ?? "0.10") });
  const startedAt = Date.now();
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 150_000);
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        const message = json && typeof json === "object" && "error" in json ? JSON.stringify((json as { error: unknown }).error) : `HTTP ${response.status}`;
        throw new Error(`OpenAI request failed: ${message}`);
      }
      const parsed = JSON.parse(extractOutputText(json));
      const result = envelopeSchema.parse(parsed);
      await completeAiRequest({ ledgerId: reservation.ledgerId, ok: true, usage: responseUsage(json), durationMs: Date.now()-startedAt, responseId: typeof (json as any)?.id === "string" ? (json as any).id : null });
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Business analysis failed.");
    }
  }
  await completeAiRequest({ ledgerId: reservation.ledgerId, ok: false, durationMs: Date.now()-startedAt, errorCode: "ANALYSIS_FAILED", errorMessage: lastError?.message ?? "Business analysis failed" }).catch(()=>undefined);
  throw lastError ?? new Error("Business analysis failed.");
}

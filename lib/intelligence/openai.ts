import { type AiEnvelope } from "@/lib/ai/contracts";
import { type BusinessDnaPayload } from "@/lib/ai/schemas/business-dna";
import { businessDiscoveryJsonSchema } from "@/lib/intelligence/business-discovery-schema";
import type { WebsiteSource } from "@/lib/intelligence/website-reader";
import { resolveOpenAIModel } from "@/lib/intelligence/model-router";
import { completeAiRequest, reserveAiRequest, responseUsage } from "@/lib/ai/governance";
import { stableFingerprint } from "@/lib/ai/cost-optimisation";
import { normaliseBusinessAnalysis } from "@/lib/intelligence/fit-score";
import { parseStructuredAiResponse, safeStructuredAiError } from "@/lib/ai/structured-response-gateway";
import { BusinessDiscoveryGatewaySchema, canonicaliseBusinessDiscoveryOutput } from "@/lib/intelligence/business-structured-output";

const ENDPOINT = "https://api.openai.com/v1/responses";

function getConfig() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");

  const resolved = resolveOpenAIModel("strategy");
  return { apiKey, model: resolved.model, modelSource: resolved.source };
}

export async function analyseBusiness(params: { organisationId:string|null; jobId:string; website: string; sources: WebsiteSource[] }): Promise<AiEnvelope<BusinessDnaPayload>> {
  const { apiKey, model } = getConfig();
  const compactSources = params.sources.slice(0, 8).map(source => ({...source, text: source.text.slice(0, 6000)}));
  const sourceBlock = compactSources.map((source, index) => `SOURCE ${index + 1}\nURL: ${source.url}\nTITLE: ${source.title}\nCONTENT: ${source.text}`).join("\n\n");
  const now = new Date().toISOString();
  const instructions = `ROLE: Chief Commercial Strategy Officer for SalesPilot.\n\nMISSION:\nUnderstand the selling company deeply enough to brief an elite revenue team on where scarce commercial effort should and should not be deployed. Do not merely summarise the website. Translate the supplied first-party evidence into an evidence-backed commercial model: customer -> problem -> mechanism -> outcome -> buying situation -> credible proof.\n\nEXECUTIVE ACCOUNTABILITY:\n- Define what the company truly sells, how value is created, who experiences the problem, who is likely to own the consequence, and which buying circumstances make the offer materially more relevant.\n- Build useful ICPs AND anti-ICPs: identify prospects that may look superficially suitable but should not consume sales capacity. Express anti-ICP thinking through campaign risks, lower fit, exclusions, and unknowns supported by the schema.\n- Propose campaigns as if you were responsible for the seller's annual revenue target and had to justify allocating account-executive time to each segment.\n- Infer likely buying roles and organisational context from the evidence, but never invent a named customer, budget, technology, pain, result or purchasing process.\n\nDECISION STANDARD:\nFor every campaign ask: "Would I deliberately allocate scarce senior selling capacity to this market, and what observable evidence would make me change my mind?" Strong campaigns should have a clear operating reality, a credible buyer, an explainable commercial consequence, and a reason the seller can legitimately help.\n\nTRUTH MODEL:\n- KNOWN = directly supported by supplied source material.\n- INFERRED = commercially reasonable interpretation; expose uncertainty through confidence, why and risks.\n- UNKNOWN = not supportable; place it in unknowns rather than filling the gap.\nNever convert INFERRED or UNKNOWN into a factual claim.\n\nQUALITY RULES:\n- Use only supplied source material for factual claims about the company.\n- Campaign fitScore MUST use a 0-100 scale, never 0-10. Excellent matches normally score 85-100, strong matches 75-84, weak matches below 50.\n- Keep fitScore separate from confidence; confidence remains 0-1.\n- Prefer specific operational/commercial mechanisms over generic claims such as efficiency, transformation or growth.\n- Avoid guaranteed revenue, meeting, lead, ROI or outcome claims.\n- Challenge each proposed campaign once: state the strongest reason it could be a poor use of sales effort and reflect that in risks/fit.\n- Write concise, calm British English.\n- Return the exact JSON schema only.\n- Set schemaVersion to business-dna/v1 and promptVersion to business-discovery/v2-executive.\n- Set model to ${model} and generatedAt to ${now}.\n- Use the canonical website ${params.website}.`;

  const body = {
    model,
    instructions,
    input: sourceBlock,
    reasoning: { effort: "medium" },
    text: {
      format: {
        type: "json_schema",
        name: "salespilot_business_discovery",
        description: "Evidence-backed Business DNA and initial outbound campaign proposals.",
        strict: true,
        schema: businessDiscoveryJsonSchema,
      },
    },
    // This schema contains Business DNA plus several complete campaign proposals.
    // GPT-5 reasoning tokens share this allowance with the final JSON, so a
    // smaller cap can truncate otherwise valid structured output mid-string.
    max_output_tokens: 9_000,
    store: false,
  };

  const fingerprint = stableFingerprint({prompt:"business-discovery/v2-executive",model,website:params.website,sources:compactSources});
  const reservation = await reserveAiRequest({ organisationId: params.organisationId, jobType: "BUSINESS_ANALYSIS", jobId: params.jobId, requestScope: `business-analysis:${fingerprint}`, model, estimatedCostUsd: Number(process.env.SALESPILOT_BUSINESS_ANALYSIS_ESTIMATED_COST_USD ?? "0.10") });
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
      const parsed = await parseStructuredAiResponse({ response: json, schema: BusinessDiscoveryGatewaySchema, jsonSchema: businessDiscoveryJsonSchema, schemaName: "salespilot_business_discovery", apiKey, model });
      const result = normaliseBusinessAnalysis(canonicaliseBusinessDiscoveryOutput(parsed.value, { canonicalWebsite: params.website, model, generatedAt: now }));
      await completeAiRequest({ ledgerId: reservation.ledgerId, ok: true, usage: responseUsage(json), durationMs: Date.now()-startedAt, responseId: typeof (json as any)?.id === "string" ? (json as any).id : null });
      return result;
    } catch (error) {
      const safe = safeStructuredAiError(error);
      // Never allow a raw JSON parser exception to escape this boundary.
      lastError = safe.code === "INVALID_STRUCTURED_OUTPUT" || safe.code === "INVALID_JSON" || safe.code === "INVALID_SCHEMA" || safe.code === "REPAIR_FAILED" || safe.code === "EMPTY"
        ? new Error(`STRUCTURED_AI_OUTPUT_${safe.code}:${safe.message}`)
        : error instanceof Error ? error : new Error(safe.message);
    }
  }
  await completeAiRequest({ ledgerId: reservation.ledgerId, ok: false, durationMs: Date.now()-startedAt, errorCode: "ANALYSIS_FAILED", errorMessage: lastError?.message ?? "Business analysis failed" }).catch(()=>undefined);
  throw lastError ?? new Error("Business analysis failed.");
}

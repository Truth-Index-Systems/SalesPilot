import { discardOpenAIBackgroundResponse, fetchResumableOpenAIResponse, isOpenAIBackgroundPending } from "@/lib/ai/background-response";
import { type AiEnvelope } from "@/lib/ai/contracts";
import { type BusinessDnaPayload } from "@/lib/ai/schemas/business-dna";
import { businessDiscoveryJsonSchema } from "@/lib/intelligence/business-discovery-schema";
import type { WebsiteSource } from "@/lib/intelligence/website-reader";
import { resolveOpenAIModel } from "@/lib/intelligence/model-router";
import { completeAiRequest, reserveAiRequest, responseUsage } from "@/lib/ai/governance";
import { stableFingerprint } from "@/lib/ai/cost-optimisation";
import { normaliseBusinessAnalysis } from "@/lib/intelligence/fit-score";
import { StructuredAiOutputError, parseStructuredAiResponse, safeStructuredAiError } from "@/lib/ai/structured-response-gateway";
import { BusinessDiscoveryGatewaySchema, canonicaliseBusinessDiscoveryOutput } from "@/lib/intelligence/business-structured-output";
import { aiRequestTimeoutMs, classifyOpenAITransportError } from "@/lib/ai/request-policy";
import { aiWorkloadProfile, aiPromptCacheKey } from "@/lib/ai/workload-profile";

const ENDPOINT = "https://api.openai.com/v1/responses";

function getConfig() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");

  const resolved = resolveOpenAIModel("strategy");
  return { apiKey, model: resolved.model, modelSource: resolved.source };
}

export async function analyseBusiness(params: { organisationId:string|null; publicAnalysis?:boolean; jobId:string; website: string; sources: WebsiteSource[] }): Promise<AiEnvelope<BusinessDnaPayload>> {
  const { apiKey, model } = getConfig();
  const profile = aiWorkloadProfile("BUSINESS_ANALYSIS");
  const compactSources = params.sources.slice(0, 8).map(source => ({...source, text: source.text.slice(0, 4500)}));
  const sourceBlock = compactSources.map((source, index) => `SOURCE ${index + 1}\nURL: ${source.url}\nTITLE: ${source.title}\nCONTENT: ${source.text}`).join("\n\n");
  const now = new Date().toISOString();
  const requestInput = `CANONICAL WEBSITE: ${params.website}\nMODEL LABEL: ${model}\nGENERATED AT: ${now}\n\n${sourceBlock}`;
  const instructions = `ROLE: Chief Commercial Strategy Officer for MarketRoute.

MISSION:
Understand the selling company deeply enough to brief an elite revenue organisation on where scarce commercial effort should and should not be deployed. Do not merely summarise the website. Translate supplied first-party evidence into an evidence-backed commercial model: customer -> problem -> mechanism -> outcome -> buying situation -> credible proof.

ACCOUNTABLE FOR:
- Defining what the seller actually sells, how value is created, who experiences the underlying problem, who is likely to own the consequence, and which buying circumstances materially strengthen relevance.
- Designing evidence-backed campaign theses, ICPs and anti-ICPs that a revenue leader could defend when allocating sales capacity.
- Advising on likely buyer functions, organisational context and commercial relevance at segment level.

ADVISES BUT DOES NOT DECIDE:
- You may recommend campaigns, buyer-role hypotheses and fit based on the supplied evidence.
- You do NOT approve campaigns, allocate scheduler priority, set system thresholds, decide whether a company becomes an Opportunity, choose a contact/route, approve outreach, or trigger execution. Deterministic MarketRoute and later specialist executives own those decisions.

OUT OF SCOPE / HAND OFF:
- Company Discovery owns which real accounts satisfy the approved campaign.
- Account Mapping / Route Intelligence owns who to approach and how to enter a specific organisation.
- Commercial Reasoning owns the account-specific reason to engage.
- Do not compensate for missing downstream information by inventing company-specific contacts, routes, budgets, pains, technologies, trigger events, results or purchasing processes.

DECISION STANDARD:
For every campaign ask: "Would I deliberately allocate scarce senior selling capacity to this market, and what observable evidence would make me change my mind?" Strong campaigns have a clear operating reality, a credible buyer environment, an explainable commercial consequence and a reason the seller can legitimately help.

TRUTH MODEL:
- KNOWN = directly supported by supplied source material.
- INFERRED = commercially reasonable interpretation; expose uncertainty through confidence, why and risks.
- UNKNOWN = not supportable; place it in unknowns rather than filling the gap.
Never convert INFERRED or UNKNOWN into a factual claim.

QUALITY RULES:
- Use only supplied source material for factual claims about the company.
- Campaign fitScore MUST use a 0-100 scale, never 0-10. Excellent matches normally score 85-100, strong matches 75-84, weak matches below 50.
- Keep fitScore separate from confidence; confidence remains 0-1.
- Prefer specific operational/commercial mechanisms over generic claims such as efficiency, transformation or growth.
- Avoid guaranteed revenue, meeting, lead, ROI or outcome claims.
- Challenge each proposed campaign once: state the strongest reason it could be a poor use of sales effort and reflect that in risks/fit.
- Everything outside your accountability belongs to another executive or deterministic MarketRoute. Do not assume another role merely to complete the task.
- Write concise, calm British English.
- Return the exact JSON schema only.
- Set schemaVersion to business-dna/v1 and promptVersion to business-discovery/v3-responsibility-boundary.
- Set model and generatedAt exactly from the supplied request input metadata.
- Use the canonical website exactly from the supplied request input metadata.`;

  const body = {
    model,
    instructions,
    input: requestInput,
    reasoning: { effort: profile.reasoningEffort },
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
    max_output_tokens: profile.maxOutputTokens,
    store: false,
  };

  const fingerprint = stableFingerprint({prompt:profile.promptVersion,cacheKey:aiPromptCacheKey("BUSINESS_ANALYSIS"),model,website:params.website,sources:compactSources});
  const reservation = await reserveAiRequest({ organisationId: params.organisationId, jobType: "BUSINESS_ANALYSIS", jobId: params.jobId, requestScope: `business-analysis:${fingerprint}`, model, estimatedCostUsd: Number(process.env.SALESPILOT_BUSINESS_ANALYSIS_ESTIMATED_COST_USD ?? "0.10"), publicAnalysis: params.publicAnalysis === true });
  const startedAt = Date.now();
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const requestTimeoutMs = aiRequestTimeoutMs("BUSINESS_ANALYSIS");
      const response = await fetchResumableOpenAIResponse({ apiKey, task: "BUSINESS_ANALYSIS", organisationId: params.organisationId, jobType: "BUSINESS_ANALYSIS", jobId: params.jobId, requestScope: `business-analysis:${fingerprint}`, model, ledgerId: reservation.ledgerId }, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
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
      if (isOpenAIBackgroundPending(error)) throw error;
      // Structured-output failures remain schema failures; transport/HTTP failures
      // are normalised separately so timeout recovery is visible and actionable.
      if (error instanceof StructuredAiOutputError) {
        await discardOpenAIBackgroundResponse({ organisationId: params.organisationId, jobType: "BUSINESS_ANALYSIS", jobId: params.jobId, requestScope: `business-analysis:${fingerprint}` }).catch(()=>undefined);
        const safe = safeStructuredAiError(error);
        lastError = new Error(`STRUCTURED_AI_OUTPUT_${safe.code}:${safe.message}`);
      } else {
        const timeoutMs = aiRequestTimeoutMs("BUSINESS_ANALYSIS");
        lastError = classifyOpenAITransportError(error, "BUSINESS_ANALYSIS", timeoutMs).error;
      }
    }
  }
  await completeAiRequest({ ledgerId: reservation.ledgerId, ok: false, durationMs: Date.now()-startedAt, errorCode: "ANALYSIS_FAILED", errorMessage: lastError?.message ?? "Business analysis failed" }).catch(()=>undefined);
  throw lastError ?? new Error("Business analysis failed.");
}

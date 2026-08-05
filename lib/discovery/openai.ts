import "server-only";

import { resolveOpenAIModel } from "@/lib/intelligence/model-router";
import { normaliseDiscoveryResult } from "./normalise";
import { CompanyDiscoveryResultSchema } from "./schemas";

const ENDPOINT = "https://api.openai.com/v1/responses";

function outputText(value: unknown): string {
  const data = value as {
    output_text?: unknown;
    output?: Array<{ content?: Array<{ text?: unknown }> }>;
  };

  if (typeof data.output_text === "string") return data.output_text;

  for (const item of data.output ?? []) {
    for (const part of item.content ?? []) {
      if (typeof part.text === "string") return part.text;
    }
  }

  throw new Error("DISCOVERY_RESPONSE_EMPTY");
}

const scoreSchema = {
  type: "integer",
  minimum: 0,
  maximum: 100,
} as const;

const companyDiscoveryJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "searchSummary", "companies"],
  properties: {
    schemaVersion: { type: "string", enum: ["company-discovery/v2"] },
    searchSummary: { type: "string" },
    companies: {
      type: "array",
      minItems: 1,
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "name", "websiteUrl", "country", "industry", "summary",
          "confidence", "matchLabel", "fitBreakdown", "why",
          "uncertainties", "riskFlags", "evidence",
        ],
        properties: {
          name: { type: "string" },
          websiteUrl: { type: "string" },
          country: { type: "string" },
          industry: { type: "string" },
          summary: { type: "string" },
          confidence: scoreSchema,
          matchLabel: {
            type: "string",
            enum: ["Strongest match", "Strong match", "Good match"],
          },
          fitBreakdown: {
            type: "object",
            additionalProperties: false,
            required: ["industryFit", "audienceFit", "operationalFit", "geographyFit", "commercialFit"],
            properties: {
              industryFit: scoreSchema,
              audienceFit: scoreSchema,
              operationalFit: scoreSchema,
              geographyFit: scoreSchema,
              commercialFit: scoreSchema,
            },
          },
          why: { type: "array", items: { type: "string" } },
          uncertainties: { type: "array", items: { type: "string" } },
          riskFlags: { type: "array", items: { type: "string" } },
          evidence: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["claim", "sourceUrl", "sourceTitle", "excerpt"],
              properties: {
                claim: { type: "string" },
                sourceUrl: { type: "string" },
                sourceTitle: { type: ["string", "null"] },
                excerpt: { type: ["string", "null"] },
              },
            },
          },
        },
      },
    },
  },
} as const;

type DiscoverCompaniesInput = {
  campaign: Record<string, unknown>;
  business: Record<string, unknown>;
  customerWebsite?: string | null;
  excludedCompanies?: Array<{ name: string; domain: string }>;
};

export async function discoverCompanies(input: DiscoverCompaniesInput) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY_NOT_CONFIGURED");

  const model = resolveOpenAIModel("analysis").model;
  const response = await fetch(ENDPOINT, {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(220_000),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      instructions: [
        "You are SalesPilot Company Discovery.",
        "Use web search to find real operating B2B companies that genuinely match the approved outbound sales campaign.",
        "Return only official company websites and evidence from those official domains.",
        "Do not invent employee counts, technology usage, operational problems, buyer intent, or private information.",
        "Exclude the customer's own company, directories, agencies listing clients, news articles, and duplicate domains.",
        "Never return a company present in excludedCompanies. Treat both its canonical domain and company name as already researched.",
        "Score industry fit, audience fit, operational fit, geography fit, and commercial fit independently.",
        "Record genuine uncertainties and risk flags instead of hiding them.",
        "Prefer 8–12 high-confidence matches.",
        "Use British English.",
      ].join(" "),
      input: JSON.stringify({
        approvedCampaign: input.campaign,
        approvedBusinessUnderstanding: input.business,
        customerWebsite: input.customerWebsite ?? null,
        excludedCompanies: input.excludedCompanies ?? [],
      }),
      tools: [{ type: "web_search_preview", search_context_size: "medium" }],
      text: {
        format: {
          type: "json_schema",
          name: "salespilot_company_discovery_v2",
          strict: true,
          schema: companyDiscoveryJsonSchema,
        },
      },
      max_output_tokens: 11_000,
      store: false,
    }),
  });

  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const errorResponse = json as { error?: unknown } | null;
    throw new Error(`OPENAI_DISCOVERY_FAILED:${response.status}:${JSON.stringify(errorResponse?.error ?? null)}`);
  }

  let decodedOutput: unknown;
  try {
    decodedOutput = JSON.parse(outputText(json));
  } catch {
    throw new Error("DISCOVERY_RESPONSE_INVALID_JSON");
  }

  const parsed = CompanyDiscoveryResultSchema.parse(decodedOutput);
  return normaliseDiscoveryResult(parsed, { customerWebsite: input.customerWebsite });
}

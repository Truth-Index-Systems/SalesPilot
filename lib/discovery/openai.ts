import "server-only";
import { CompanyDiscoveryResultSchema } from "./schemas";
import { resolveOpenAIModel } from "@/lib/intelligence/model-router";

const ENDPOINT = "https://api.openai.com/v1/responses";

function outputText(value: unknown): string {
  const data = value as { output_text?: unknown; output?: Array<{ content?: Array<{ text?: unknown }> }> };
  if (typeof data?.output_text === "string") return data.output_text;
  for (const item of data?.output ?? []) for (const part of item.content ?? []) if (typeof part.text === "string") return part.text;
  throw new Error("DISCOVERY_RESPONSE_EMPTY");
}

const schema = {
  type: "object", additionalProperties: false, required: ["schemaVersion","searchSummary","companies"],
  properties: {
    schemaVersion: { type: "string", enum: ["company-discovery/v1"] },
    searchSummary: { type: "string" },
    companies: { type: "array", minItems: 1, maxItems: 20, items: { type: "object", additionalProperties: false,
      required: ["name","websiteUrl","country","industry","summary","confidence","matchLabel","why","uncertainties","evidence"],
      properties: {
        name:{type:"string"}, websiteUrl:{type:"string"}, country:{type:"string"}, industry:{type:"string"}, summary:{type:"string"}, confidence:{type:"integer",minimum:0,maximum:100},
        matchLabel:{type:"string",enum:["Strongest match","Strong match","Good match"]}, why:{type:"array",items:{type:"string"}}, uncertainties:{type:"array",items:{type:"string"}},
        evidence:{type:"array",minItems:1,items:{type:"object",additionalProperties:false,required:["claim","sourceUrl","sourceTitle","excerpt"],properties:{claim:{type:"string"},sourceUrl:{type:"string"},sourceTitle:{type:["string","null"]},excerpt:{type:["string","null"]}}}}
      }
    }}
  }
};

export async function discoverCompanies(input: { campaign: Record<string, unknown>; business: Record<string, unknown> }) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY_NOT_CONFIGURED");
  const model = resolveOpenAIModel("analysis").model;
  const response = await fetch(ENDPOINT, { method:"POST", cache:"no-store", headers:{authorization:`Bearer ${apiKey}`,"content-type":"application/json"}, body:JSON.stringify({
    model,
    instructions: `You are SalesPilot Company Discovery. Use web search to find real operating B2B companies that genuinely match the approved outbound sales campaign. Return only companies with a working official website and evidence from public web pages. Do not invent employee counts, technology usage, operational problems or buyer intent. Exclude the customer's own company, directories, agencies listing clients, news articles and duplicate domains. Prefer 8-12 high-confidence matches. British English.`,
    input: JSON.stringify({ approvedCampaign: input.campaign, approvedBusinessUnderstanding: input.business }),
    tools:[{type:"web_search_preview",search_context_size:"medium"}],
    text:{format:{type:"json_schema",name:"salespilot_company_discovery",strict:true,schema}},
    max_output_tokens:9000, store:false,
  })});
  const json = await response.json().catch(()=>null);
  if (!response.ok) throw new Error(`OPENAI_DISCOVERY_FAILED:${response.status}:${JSON.stringify((json as any)?.error ?? null)}`);
  return CompanyDiscoveryResultSchema.parse(JSON.parse(outputText(json)));
}

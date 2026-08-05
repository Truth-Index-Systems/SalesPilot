import "server-only";
import { resolveOpenAIModel } from "@/lib/intelligence/model-router";
import { ContactDiscoveryResultSchema } from "./schemas";
import { normaliseContactDiscoveryResult } from "./normalise";

const ENDPOINT = "https://api.openai.com/v1/responses";
const score = { type: "integer", minimum: 0, maximum: 100 } as const;
const nullableString = { type: ["string", "null"] } as const;

const schema = {
  type: "object", additionalProperties: false,
  required: ["schemaVersion","companyId","researchSummary","contacts","unresolvedRoles","uncertainties"],
  properties: {
    schemaVersion: { type: "string", enum: ["contact-discovery/v1"] },
    companyId: { type: "string" }, researchSummary: { type: "string" },
    unresolvedRoles: { type: "array", items: { type: "string" } },
    uncertainties: { type: "array", items: { type: "string" } },
    contacts: { type: "array", maxItems: 20, items: {
      type: "object", additionalProperties: false,
      required: ["fullName","roleTitle","department","location","reasonSelected","confidence","unknowns","riskFlags","evidence"],
      properties: {
        fullName:{type:"string"}, roleTitle:{type:"string"}, department:nullableString, location:nullableString, reasonSelected:{type:"string"},
        confidence:{ type:"object", additionalProperties:false, required:["identity","role","buyingRelevance","operationalRelevance","evidenceQuality","overall","label"], properties:{ identity:score,role:score,buyingRelevance:score,operationalRelevance:score,evidenceQuality:score,overall:score,label:{type:"string",enum:["VERIFIED","LIKELY","POSSIBLE","UNKNOWN"]} } },
        unknowns:{type:"array",items:{type:"string"}}, riskFlags:{type:"array",items:{type:"string"}},
        evidence:{type:"array",minItems:2,maxItems:12,items:{type:"object",additionalProperties:false,required:["evidenceType","claim","sourceUrl","sourceTitle","excerpt","sourceKind","sourceDomain","verified","excerptMatched","qualityScore","retrievedAt"],properties:{ evidenceType:{type:"string",enum:["IDENTITY","ROLE","DEPARTMENT","LOCATION","BUYING_RELEVANCE","OPERATIONAL_RELEVANCE"]},claim:{type:"string"},sourceUrl:{type:"string"},sourceTitle:nullableString,excerpt:nullableString,sourceKind:{type:"string",enum:["OFFICIAL_WEBSITE","OFFICIAL_LINKEDIN_COMPANY","PRESS_RELEASE","REGULATORY_FILING","PUBLISHED_STAFF_DIRECTORY"]},sourceDomain:nullableString,verified:{type:"boolean"},excerptMatched:{type:"boolean"},qualityScore:score,retrievedAt:nullableString }} }
      }
    }}
  }
} as const;

function outputText(value: unknown) {
  const data=value as {output_text?:unknown;output?:Array<{content?:Array<{text?:unknown}>}>};
  if(typeof data.output_text==="string") return data.output_text;
  for(const item of data.output??[]) for(const part of item.content??[]) if(typeof part.text==="string") return part.text;
  throw new Error("CONTACT_DISCOVERY_RESPONSE_EMPTY");
}

export async function discoverContacts(input:{company:Record<string,unknown>;campaign:Record<string,unknown>;business:Record<string,unknown>}) {
  const apiKey=process.env.OPENAI_API_KEY?.trim(); if(!apiKey) throw new Error("OPENAI_API_KEY_NOT_CONFIGURED");
  const response=await fetch(ENDPOINT,{method:"POST",cache:"no-store",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({
    model:resolveOpenAIModel("analysis").model,
    instructions:[
      "You are SalesPilot Contact Discovery.",
      "Research only real, currently supportable decision-makers at the supplied approved company.",
      "Use the official company website, official company LinkedIn presence, official press releases, public regulatory filings, or an official published staff directory.",
      "Never use people-search databases, scraped personal databases, guessed email patterns, or random directories.",
      "Never invent a person, title, department, location, source, quote, or employment status.",
      "A contact must have independent evidence for both identity and current role. Return uncertainty instead of guessing.",
      "Prioritise operational buying roles relevant to the approved campaign. Only return supported roles.",
      "Evidence excerpts must accurately reflect the cited page. Use British English."
    ].join(" "),
    input:JSON.stringify(input), tools:[{type:"web_search_preview",search_context_size:"medium"}],
    text:{format:{type:"json_schema",name:"salespilot_contact_discovery_v1",strict:true,schema}}, max_output_tokens:12000,store:false
  })});
  const json:unknown=await response.json().catch(()=>null);
  if(!response.ok) throw new Error(`OPENAI_CONTACT_DISCOVERY_FAILED:${response.status}:${JSON.stringify((json as any)?.error??null)}`);
  let decoded:unknown; try{decoded=JSON.parse(outputText(json));}catch{throw new Error("CONTACT_DISCOVERY_RESPONSE_INVALID_JSON");}
  const parsed=ContactDiscoveryResultSchema.parse(decoded);
  if(parsed.companyId!==String(input.company.id)) throw new Error("CONTACT_DISCOVERY_COMPANY_MISMATCH");
  return normaliseContactDiscoveryResult(parsed,String(input.company.website_url??""));
}

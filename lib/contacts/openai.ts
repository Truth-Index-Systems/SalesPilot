import "server-only";
import { resolveOpenAIModel } from "@/lib/intelligence/model-router";
import { completeAiRequest, reserveAiRequest, responseUsage } from "@/lib/ai/governance";
import { ContactDiscoveryResultSchema } from "./schemas";
import { normaliseContactDiscoveryResult } from "./normalise";
import { compactContactDiscoveryInput, stableFingerprint } from "@/lib/ai/cost-optimisation";
import { parseStructuredAiResponse, safeStructuredAiError } from "@/lib/ai/structured-response-gateway";

const ENDPOINT="https://api.openai.com/v1/responses";
const score={type:"integer",minimum:0,maximum:100} as const;
const nullableString={type:["string","null"]} as const;
const schema={
  type:"object",additionalProperties:false,
  required:["schemaVersion","companyId","researchSummary","contacts","companyContactChannels","unresolvedRoles","uncertainties"],
  properties:{
    schemaVersion:{type:"string",enum:["contact-discovery/v3"]}, companyId:{type:"string"}, researchSummary:{type:"string"},
    unresolvedRoles:{type:"array",items:{type:"string"}}, uncertainties:{type:"array",items:{type:"string"}},
    companyContactChannels:{type:"array",maxItems:10,items:{type:"object",additionalProperties:false,required:["emailAddress","channelType","department","associatedContactName","likelyReader","reasonSelected","verificationStatus","confidence","routingScore","responseLikelihood","campaignRelevance","sourceUrl","sourceTitle","evidenceExcerpt"],properties:{emailAddress:{type:"string"},channelType:{type:"string",enum:["NAMED","DEPARTMENTAL","GENERAL"]},department:nullableString,associatedContactName:nullableString,likelyReader:{type:"string"},reasonSelected:{type:"string"},verificationStatus:{type:"string",enum:["PUBLIC_VERIFIED","PATTERN_LIKELY"]},confidence:score,routingScore:score,responseLikelihood:score,campaignRelevance:score,sourceUrl:{type:"string"},sourceTitle:nullableString,evidenceExcerpt:{type:"string"}}}},
    contacts:{type:"array",maxItems:8,items:{type:"object",additionalProperties:false,
      required:["fullName","roleTitle","department","location","reasonSelected","confidence","email","linkedin","unknowns","riskFlags","evidence"],
      properties:{
        fullName:{type:"string"},roleTitle:{type:"string"},department:nullableString,location:nullableString,reasonSelected:{type:"string"},
        confidence:{type:"object",additionalProperties:false,required:["identity","role","buyingRelevance","operationalRelevance","evidenceQuality","overall","label"],properties:{identity:score,role:score,buyingRelevance:score,operationalRelevance:score,evidenceQuality:score,overall:score,label:{type:"string",enum:["VERIFIED","LIKELY","POSSIBLE","UNKNOWN"]}}},
        email:{type:"object",additionalProperties:false,required:["address","status","confidence","sourceUrl","reason"],properties:{address:nullableString,status:{type:"string",enum:["VERIFIED","LIKELY","UNKNOWN"]},confidence:score,sourceUrl:nullableString,reason:{type:"string"}}},
        linkedin:{type:"object",additionalProperties:false,required:["profileUrl","status","confidence","sourceUrl","reason"],properties:{profileUrl:nullableString,status:{type:"string",enum:["VERIFIED","HIGH_CONFIDENCE","UNKNOWN"]},confidence:score,sourceUrl:nullableString,reason:{type:"string"}}},
        unknowns:{type:"array",items:{type:"string"}},riskFlags:{type:"array",items:{type:"string"}},
        evidence:{type:"array",minItems:2,maxItems:6,items:{type:"object",additionalProperties:false,required:["evidenceType","claim","sourceUrl","sourceTitle","excerpt","sourceKind","sourceDomain","verified","excerptMatched","qualityScore","retrievedAt"],properties:{evidenceType:{type:"string",enum:["IDENTITY","ROLE","DEPARTMENT","LOCATION","BUYING_RELEVANCE","OPERATIONAL_RELEVANCE","EMAIL","LINKEDIN"]},claim:{type:"string"},sourceUrl:{type:"string"},sourceTitle:nullableString,excerpt:nullableString,sourceKind:{type:"string",enum:["OFFICIAL_WEBSITE","OFFICIAL_LINKEDIN_COMPANY","OFFICIAL_LINKEDIN_PROFILE","PRESS_RELEASE","REGULATORY_FILING","PUBLISHED_STAFF_DIRECTORY"]},sourceDomain:nullableString,verified:{type:"boolean"},excerptMatched:{type:"boolean"},qualityScore:score,retrievedAt:nullableString}}}
      }
    }}
  }
} as const;

export async function discoverContacts(input:{organisationId:string;campaignId:string;schedulerRunId?:string|null;jobId:string;company:Record<string,unknown>;campaign:Record<string,unknown>;business:Record<string,unknown>}){
  const apiKey=process.env.OPENAI_API_KEY?.trim();if(!apiKey)throw new Error("OPENAI_API_KEY_NOT_CONFIGURED");
  const model=resolveOpenAIModel("analysis").model;
  const compactInput=compactContactDiscoveryInput(input);
  const fingerprint=stableFingerprint({prompt:"contact-discovery/v3-cost-optimised",model,compactInput});
  const startedAt=Date.now();
  const reservation=await reserveAiRequest({organisationId:input.organisationId,campaignId:input.campaignId,schedulerRunId:input.schedulerRunId,jobType:"CONTACT_DISCOVERY",jobId:input.jobId,requestScope:`contact-discovery:${fingerprint}`,model,estimatedCostUsd:Number(process.env.SALESPILOT_CONTACT_DISCOVERY_ESTIMATED_COST_USD??"0.35")});
  let response:Response;
  try{response=await fetch(ENDPOINT,{method:"POST",cache:"no-store",signal:AbortSignal.timeout(150_000),headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({
    model,
    instructions:[
      "You are SalesPilot Contact Discovery.",
      "Research only real, currently supportable decision-makers at the supplied approved company.",
      "Use official company pages, official LinkedIn company or individual profile pages, official press releases, public regulatory filings, or official published staff directories.",
      "Never use people-search databases, scraped personal databases, data brokers, random directories, or unverifiable snippets.",
      "Never invent a person, title, department, location, email address, LinkedIn profile, source, quote, or employment status.",
      "A contact must have independent evidence for both identity and current role. Return uncertainty instead of guessing.",
      "For a named person email: VERIFIED requires the exact personal address on an official source. LIKELY is permitted only when an official company-domain convention is explicitly supported by official evidence; explain the pattern and never label it verified. Otherwise return UNKNOWN with null address.",
      "Separately search the company website and other official public sources for every useful company-domain business email route: named, departmental and general inboxes. Rank each route for this campaign using likely reader, operational relevance, response likelihood and routing score.",
      "A PUBLIC_VERIFIED company channel must show the exact email on the cited official page. PATTERN_LIKELY may only be returned when the official source explicitly demonstrates the company naming convention. Never manufacture an address from a name alone.",
      "Prefer operational, commercial, projects, manufacturing, logistics, warehouse, enquiries and other monitored routes over generic info addresses when evidence supports them. Include generic routes when they are the only legitimate path into the company.",
      "For LinkedIn: only return a direct linkedin.com/in profile URL when the name, employer, and role match the contact. VERIFIED requires direct strong matching evidence; HIGH_CONFIDENCE is allowed when the match is strong but not independently confirmed. Otherwise return UNKNOWN with null URL.",
      "Provide EMAIL and LINKEDIN evidence entries whenever a channel is returned. The evidence must support the stated status.",
      "Prioritise the strongest operational buying roles relevant to the approved campaign. Return at most 5 well-supported people and the best 5 routes. Use British English."
    ].join(" "),
    input:JSON.stringify(compactInput),tools:[{type:"web_search_preview",search_context_size:"low"}],
    text:{format:{type:"json_schema",name:"salespilot_contact_discovery_v3",strict:true,schema}},max_output_tokens:7500,store:false
  })});}catch(error){await completeAiRequest({ledgerId:reservation.ledgerId,ok:false,durationMs:Date.now()-startedAt,errorCode:"NETWORK",errorMessage:error instanceof Error?error.message:"OpenAI request failed"}).catch(()=>undefined);throw error;}
  const json:unknown=await response.json().catch(()=>null);
  if(!response.ok){await completeAiRequest({ledgerId:reservation.ledgerId,ok:false,usage:responseUsage(json),webSearchCalls:1,durationMs:Date.now()-startedAt,responseId:typeof (json as any)?.id==="string"?(json as any).id:null,errorCode:`HTTP_${response.status}`,errorMessage:JSON.stringify((json as any)?.error??null)}).catch(()=>undefined);throw new Error(`OPENAI_CONTACT_DISCOVERY_FAILED:${response.status}:${JSON.stringify((json as any)?.error??null)}`);}
  let parsed:ReturnType<typeof ContactDiscoveryResultSchema.parse>;
  try{const gateway=await parseStructuredAiResponse({response:json,schema:ContactDiscoveryResultSchema,jsonSchema:schema,schemaName:"salespilot_contact_discovery_v3",apiKey,model});parsed=gateway.value;}catch(error){const safe=safeStructuredAiError(error);await completeAiRequest({ledgerId:reservation.ledgerId,ok:false,usage:responseUsage(json),webSearchCalls:1,durationMs:Date.now()-startedAt,responseId:typeof (json as any)?.id==="string"?(json as any).id:null,errorCode:safe.code,errorMessage:safe.message}).catch(()=>undefined);throw new Error(`CONTACT_DISCOVERY_RESPONSE_${safe.code}`);}
  if(parsed.companyId!==String(input.company.id))throw new Error("CONTACT_DISCOVERY_COMPANY_MISMATCH");
  await completeAiRequest({ledgerId:reservation.ledgerId,ok:true,usage:responseUsage(json),webSearchCalls:1,durationMs:Date.now()-startedAt,responseId:typeof (json as any)?.id==="string"?(json as any).id:null});
  return normaliseContactDiscoveryResult(parsed,String(input.company.website_url??""));
}

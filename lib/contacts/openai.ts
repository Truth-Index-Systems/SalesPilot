import "server-only";
import { resolveOpenAIModel } from "@/lib/intelligence/model-router";
import { completeAiRequest, reserveAiRequest, responseUsage } from "@/lib/ai/governance";
import { ContactDiscoveryResultSchema } from "./schemas";
import { ContactDiscoveryGatewaySchema, canonicaliseContactDiscoveryOutput } from "./structured-output";
import { normaliseContactDiscoveryResult } from "./normalise";
import { compactContactDiscoveryInput, stableFingerprint } from "@/lib/ai/cost-optimisation";
import { parseStructuredAiResponse, safeStructuredAiError } from "@/lib/ai/structured-response-gateway";

const ENDPOINT="https://api.openai.com/v1/responses";
const score={type:"integer",minimum:0,maximum:100} as const;
const nullableString={type:["string","null"]} as const;
const evidenceSchema={
  type:"object",additionalProperties:false,
  required:["evidenceType","claim","sourceUrl","sourceTitle","excerpt","sourceKind","sourceDomain","verified","excerptMatched","qualityScore","retrievedAt"],
  properties:{
    evidenceType:{type:"string",enum:["IDENTITY","ROLE","DEPARTMENT","LOCATION","BUYING_RELEVANCE","OPERATIONAL_RELEVANCE","EMAIL","LINKEDIN"]},
    claim:{type:"string"},sourceUrl:{type:"string"},sourceTitle:nullableString,excerpt:nullableString,
    sourceKind:{type:"string",enum:["OFFICIAL_WEBSITE","OFFICIAL_LINKEDIN_COMPANY","OFFICIAL_LINKEDIN_PROFILE","PRESS_RELEASE","REGULATORY_FILING","PUBLISHED_STAFF_DIRECTORY"]},
    sourceDomain:nullableString,verified:{type:"boolean"},excerptMatched:{type:"boolean"},qualityScore:score,retrievedAt:nullableString,
  },
} as const;
const schema={
  type:"object",additionalProperties:false,
  required:["schemaVersion","companyId","researchSummary","organisationMap","buyingPaths","routes","contacts","companyContactChannels","unresolvedRoles","uncertainties"],
  properties:{
    schemaVersion:{type:"string",enum:["contact-discovery/v3"]},companyId:{type:"string"},researchSummary:{type:"string"},
    organisationMap:{type:"object",additionalProperties:false,required:["summary","departments","businessUnits","buyingCentres","hierarchy","ownershipSignals"],properties:{
      summary:{type:"string"},departments:{type:"array",items:{type:"string"}},businessUnits:{type:"array",items:{type:"string"}},buyingCentres:{type:"array",items:{type:"string"}},hierarchy:{type:"array",items:{type:"string"}},ownershipSignals:{type:"array",items:{type:"string"}},
    }},
    buyingPaths:{type:"array",maxItems:8,items:{type:"object",additionalProperties:false,required:["name","routeType","objective","entryRole","targetRole","steps","rationale","confidence"],properties:{
      name:{type:"string"},routeType:{type:"string",enum:["PRIMARY","OPERATIONAL","TRANSFORMATION","PROCUREMENT","TECHNICAL","EXECUTIVE","REGIONAL","FALLBACK"]},objective:{type:"string"},entryRole:{type:"string"},targetRole:{type:"string"},steps:{type:"array",items:{type:"string"}},rationale:{type:"string"},confidence:score,
    }}},
    routes:{type:"array",maxItems:10,items:{type:"object",additionalProperties:false,required:["routeKey","routeType","label","entryRole","targetRole","department","contactName","contactRole","channelType","channelValue","authority","accessibility","commercialRelevance","evidenceQuality","resilience","confidence","difficulty","rationale","nextStep","fallbackReason","evidence"],properties:{
      routeKey:{type:"string"},routeType:{type:"string",enum:["PRIMARY","OPERATIONAL","TRANSFORMATION","PROCUREMENT","TECHNICAL","EXECUTIVE","REGIONAL","FALLBACK"]},label:{type:"string"},entryRole:{type:"string"},targetRole:{type:"string"},department:nullableString,contactName:nullableString,contactRole:nullableString,
      channelType:{type:"string",enum:["DIRECT_EMAIL","LINKEDIN","DEPARTMENT_EMAIL","GENERAL_EMAIL","SWITCHBOARD","INTRODUCTION","UNKNOWN"]},channelValue:nullableString,
      authority:score,accessibility:score,commercialRelevance:score,evidenceQuality:score,resilience:score,confidence:score,difficulty:{type:"string",enum:["LOW","MEDIUM","HIGH"]},rationale:{type:"string"},nextStep:{type:"string"},fallbackReason:nullableString,evidence:{type:"array",maxItems:8,items:evidenceSchema},
    }}},
    unresolvedRoles:{type:"array",items:{type:"string"}},uncertainties:{type:"array",items:{type:"string"}},
    companyContactChannels:{type:"array",maxItems:10,items:{type:"object",additionalProperties:false,required:["emailAddress","channelType","department","associatedContactName","likelyReader","reasonSelected","verificationStatus","confidence","routingScore","responseLikelihood","campaignRelevance","sourceUrl","sourceTitle","evidenceExcerpt"],properties:{
      emailAddress:{type:"string"},channelType:{type:"string",enum:["NAMED","DEPARTMENTAL","GENERAL"]},department:nullableString,associatedContactName:nullableString,likelyReader:{type:"string"},reasonSelected:{type:"string"},verificationStatus:{type:"string",enum:["PUBLIC_VERIFIED","PATTERN_LIKELY"]},confidence:score,routingScore:score,responseLikelihood:score,campaignRelevance:score,sourceUrl:{type:"string"},sourceTitle:nullableString,evidenceExcerpt:{type:"string"},
    }}},
    contacts:{type:"array",maxItems:8,items:{type:"object",additionalProperties:false,required:["fullName","roleTitle","department","location","reasonSelected","confidence","email","linkedin","unknowns","riskFlags","evidence"],properties:{
      fullName:{type:"string"},roleTitle:{type:"string"},department:nullableString,location:nullableString,reasonSelected:{type:"string"},
      confidence:{type:"object",additionalProperties:false,required:["identity","role","buyingRelevance","operationalRelevance","evidenceQuality","overall","label"],properties:{identity:score,role:score,buyingRelevance:score,operationalRelevance:score,evidenceQuality:score,overall:score,label:{type:"string",enum:["VERIFIED","LIKELY","POSSIBLE","UNKNOWN"]}}},
      email:{type:"object",additionalProperties:false,required:["address","status","confidence","sourceUrl","reason"],properties:{address:nullableString,status:{type:"string",enum:["VERIFIED","LIKELY","UNKNOWN"]},confidence:score,sourceUrl:nullableString,reason:{type:"string"}}},
      linkedin:{type:"object",additionalProperties:false,required:["profileUrl","status","confidence","sourceUrl","reason"],properties:{profileUrl:nullableString,status:{type:"string",enum:["VERIFIED","HIGH_CONFIDENCE","UNKNOWN"]},confidence:score,sourceUrl:nullableString,reason:{type:"string"}}},
      unknowns:{type:"array",items:{type:"string"}},riskFlags:{type:"array",items:{type:"string"}},evidence:{type:"array",minItems:2,maxItems:6,items:evidenceSchema},
    }}},
  },
} as const;

export async function researchRouteIntelligence(input:{organisationId:string;campaignId:string;schedulerRunId?:string|null;jobId:string;company:Record<string,unknown>;campaign:Record<string,unknown>;business:Record<string,unknown>;routeExpansionPass?:number}){
  const apiKey=process.env.OPENAI_API_KEY?.trim();if(!apiKey)throw new Error("OPENAI_API_KEY_NOT_CONFIGURED");
  const model=resolveOpenAIModel("analysis").model;
  const compactInput=compactContactDiscoveryInput(input);
  const fingerprint=stableFingerprint({prompt:"contact-discovery/v3-depth-first-source-diversity",model,compactInput});
  const startedAt=Date.now();
  const reservation=await reserveAiRequest({organisationId:input.organisationId,campaignId:input.campaignId,schedulerRunId:input.schedulerRunId,jobType:"CONTACT_DISCOVERY",jobId:input.jobId,requestScope:`contact-discovery:${fingerprint}`,model,estimatedCostUsd:Number(process.env.SALESPILOT_ROUTE_INTELLIGENCE_ESTIMATED_COST_USD??(Number(input.routeExpansionPass??0)===0?"0.55":"0.30"))});
  let response:Response;
  try{response=await fetch(ENDPOINT,{method:"POST",cache:"no-store",signal:AbortSignal.timeout(Number(input.routeExpansionPass??0)===0?240_000:180_000),headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({
    model,
    instructions:[
      "You are SalesPilot Route Intelligence. Your job is not to rediscover whether the company is a fit; Company Discovery has already established that. Your job is to determine the strongest evidence-backed paths into the organisation and the people/channels that make those paths executable.",
      "Treat the supplied Company Discovery evidence, company version and Business DNA as established context. Build an organisation map only as far as necessary to understand ownership, buying centres and access paths. Do not repeat generic company-fit research.",
      "On the FIRST pass be extensive, but establish reachability first: explicitly search for supported direct emails, departmental inboxes, general monitored inboxes, switchboard routes and exact LinkedIn profiles before completing the organisation map. Then map relevant departments/business units, infer supported buying centres and likely hierarchy, generate several independent buying paths, and connect the strongest people/channels to those paths. A single contact is not a route strategy.",
      "The input may contain priorRouteMemory from earlier SalesPilot research for the same organisation and company domain. Treat it as a lead, not fresh proof: re-check the cited public source where possible, preserve a previously supported route when it remains valid, and explicitly report when it can no longer be verified. Never silently forget a known route.",
      "On expansion passes, prioritise genuinely new independent access paths and official source URLs not already represented in Company Discovery evidence or priorRouteMemory. Do not treat rereading the same URL as expansion progress. Re-check an existing source only when necessary to validate a known route, and never invent novelty where no independent source exists.",
      "Research only real, currently supportable decision-makers, influencers, introducers and monitored company routes at the supplied approved company.",
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
      "Generate route diversity where evidence supports it: primary, operational, transformation, procurement, technical, executive, regional and fallback. Score the ROUTE, not merely the person, across authority, accessibility, commercial relevance, evidence quality, resilience and confidence.",
      "A route may be useful without a named person if there is a verified departmental/general channel, switchboard or introduction path; however, never mark an unsupported path as executable. Prefer multiple independent paths over a single fragile contact.",
      "Prioritise the strongest operational buying roles relevant to the approved campaign. Return at most 8 well-supported people, 10 commercial routes and 10 company channels. Use British English.",
      input.routeExpansionPass===0?"This is the first route-research pass. Establish the strongest directly executable route and an independent fallback where official evidence supports both.":input.routeExpansionPass===1?"This is expansion pass two. Search role-title synonyms, adjacent operational buyers, direct email and LinkedIn evidence not covered in the first pass.":input.routeExpansionPass===2?"This is expansion pass three. Check departmental and monitored company inboxes, regional leadership, procurement and executive-assistant paths using official sources.":"This is the final safe expansion pass. Re-check all official access paths and return uncertainty rather than inventing a route."
    ].join(" "),
    input:JSON.stringify(compactInput),tools:[{type:"web_search_preview",search_context_size:input.routeExpansionPass===0?"medium":"low"}],
    text:{format:{type:"json_schema",name:"salespilot_contact_discovery_v3",strict:true,schema}},max_output_tokens:Number(input.routeExpansionPass??0)===0?9000:6500,store:false
  })});}catch(error){await completeAiRequest({ledgerId:reservation.ledgerId,ok:false,durationMs:Date.now()-startedAt,errorCode:"NETWORK",errorMessage:error instanceof Error?error.message:"OpenAI request failed"}).catch(()=>undefined);throw error;}
  const json:unknown=await response.json().catch(()=>null);
  if(!response.ok){await completeAiRequest({ledgerId:reservation.ledgerId,ok:false,usage:responseUsage(json),webSearchCalls:1,durationMs:Date.now()-startedAt,responseId:typeof (json as any)?.id==="string"?(json as any).id:null,errorCode:`HTTP_${response.status}`,errorMessage:JSON.stringify((json as any)?.error??null)}).catch(()=>undefined);throw new Error(`OPENAI_CONTACT_DISCOVERY_FAILED:${response.status}:${JSON.stringify((json as any)?.error??null)}`);}
  let parsed:ReturnType<typeof ContactDiscoveryResultSchema.parse>;
  try{
    const gateway=await parseStructuredAiResponse({response:json,schema:ContactDiscoveryGatewaySchema,jsonSchema:schema,schemaName:"salespilot_contact_discovery_v3",apiKey,model});
    parsed=canonicaliseContactDiscoveryOutput(gateway.value,String(input.company.id??input.company.company_id??""));
  }catch(error){const safe=safeStructuredAiError(error);await completeAiRequest({ledgerId:reservation.ledgerId,ok:false,usage:responseUsage(json),webSearchCalls:1,durationMs:Date.now()-startedAt,responseId:typeof (json as any)?.id==="string"?(json as any).id:null,errorCode:safe.code,errorMessage:safe.message}).catch(()=>undefined);throw new Error(`CONTACT_DISCOVERY_RESPONSE_${safe.code}`);}
  if(parsed.companyId!==String(input.company.id))throw new Error("CONTACT_DISCOVERY_COMPANY_MISMATCH");
  await completeAiRequest({ledgerId:reservation.ledgerId,ok:true,usage:responseUsage(json),webSearchCalls:1,durationMs:Date.now()-startedAt,responseId:typeof (json as any)?.id==="string"?(json as any).id:null});
  return normaliseContactDiscoveryResult(parsed,String(input.company.website_url??""));
}

// Backward-compatible alias for older call sites and migrations.
export const discoverContacts = researchRouteIntelligence;

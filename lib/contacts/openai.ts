import "server-only";
import { discardOpenAIBackgroundResponse, fetchResumableOpenAIResponse, isOpenAIBackgroundPending } from "@/lib/ai/background-response";
import { aiRequestTimeoutMs, classifyOpenAITransportError } from "@/lib/ai/request-policy";
import { aiWorkloadProfile, aiPromptCacheKey } from "@/lib/ai/workload-profile";
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
  const routeTask = Number(input.routeExpansionPass ?? 0) === 0 ? "ROUTE_INTELLIGENCE_FIRST_PASS" as const : "ROUTE_INTELLIGENCE_EXPANSION" as const;
  const profile=aiWorkloadProfile(routeTask);
  const passInstruction=input.routeExpansionPass===0?"FIRST PASS: establish the strongest directly executable route, identify the authority level appropriate to company scale/likely commitment, and find an independent fallback where official evidence supports it.":input.routeExpansionPass===1?"EXPANSION TWO: search role-title synonyms, adjacent buying-committee members, direct email/LinkedIn evidence and stronger authority-to-budget alignment not covered on pass one.":input.routeExpansionPass===2?"EXPANSION THREE: check departmental routes, regional/divisional leadership, procurement, transformation and executive-assistant/introduction paths using official sources.":"FINAL SAFE EXPANSION: re-check independent official access paths and return uncertainty rather than inventing a route.";
  const compactInput=compactContactDiscoveryInput({...input, passInstruction} as typeof input & {passInstruction:string},{evidenceLimit:profile.evidenceLimit,depth:profile.depth});
  const fingerprint=stableFingerprint({prompt:profile.promptVersion,cacheKey:aiPromptCacheKey(routeTask),model,compactInput});
  const startedAt=Date.now();
  const requestTimeoutMs = aiRequestTimeoutMs(routeTask);
  const reservation=await reserveAiRequest({organisationId:input.organisationId,campaignId:input.campaignId,schedulerRunId:input.schedulerRunId,jobType:"CONTACT_DISCOVERY",jobId:input.jobId,requestScope:`contact-discovery:${fingerprint}`,model,estimatedCostUsd:Number(process.env.SALESPILOT_ROUTE_INTELLIGENCE_ESTIMATED_COST_USD??(Number(input.routeExpansionPass??0)===0?"0.55":"0.30"))});
  let response:Response;
  try{response=await fetchResumableOpenAIResponse({ apiKey, task: routeTask, organisationId: input.organisationId, campaignId: input.campaignId, jobType: "CONTACT_DISCOVERY", jobId: input.jobId, requestScope: `contact-discovery:${fingerprint}`, model, ledgerId: reservation.ledgerId },{method:"POST",cache:"no-store",signal:AbortSignal.timeout(requestTimeoutMs),headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({
    model,
    instructions:[
      "ROLE: VP Account Mapping & Buying Committees, operating with the judgement of a senior enterprise account strategist.",
      "MISSION: Identify the shortest credible path from outside this approved company to a commercially relevant conversation. Do not merely find the most senior person or the easiest contact.",
      "ACCOUNTABLE FOR: Map only enough of the organisation to understand functional ownership, minimum sufficient authority, economic influence, procurement/routing power and evidence-backed access paths. Recommend the account-entry map a senior seller should take into an account-planning meeting tomorrow morning.",
      "ADVISES BUT DOES NOT DECIDE: You recommend contacts, buying roles, routes and relative route qualities. You do NOT approve the company, decide Opportunity readiness, compute the final Opportunity score, select the G5 execution channel, write outreach, approve messaging, schedule work or send anything. Deterministic MarketRoute validates evidence/reachability and later G5 executives decide engagement strategy.",
      "OUT OF SCOPE / HAND OFF: Company Discovery already decided this account deserves research. Do not re-run market fit or discard the account because access is difficult. Commercial Reasoning owns why the buyer should care; Channel Strategy owns which validated route becomes the first move. Your job is to construct the best truthful access map and expose uncertainty, not to complete those downstream jobs.",
      "AUTHORITY PRINCIPLE: Seek MINIMUM SUFFICIENT AUTHORITY, not maximum seniority. The ideal first contact is close enough to the operating problem to care and senior enough to sponsor or progress the likely commercial commitment.",
      "COMPANY-SIZE PRINCIPLE: Explicitly reason about the target company's apparent scale and organisational depth using only supplied/official evidence. In smaller firms, founder/MD/CEO or a functional head may directly own modest purchases. In mid-market firms, Head/Director/VP roles may be the natural budget owner. In large/global enterprises, prefer the relevant business-unit, regional, functional or transformation leader for ordinary operational spend; reserve group C-suite targeting for genuinely strategic enterprise-wide commitments.",
      "BUDGET-AUTHORITY PRINCIPLE: Infer the likely LEVEL of commercial commitment only from the seller's offer, pricing/business model if evidenced, campaign objective and deal context. Never invent an amount. When exact spend is unknown, use a conservative authority band and record uncertainty. Choose the verified contact whose authority is closest to the level normally required to sponsor that commitment.",
      "BUYING-COMMITTEE PRINCIPLE: Distinguish operational champion, functional owner, economic/budget authority, procurement influence, technical gatekeeper, executive sponsor and introducer when evidence supports those roles. A reachable champion with routing power can be superior to an unreachable executive.",
      "ROUTING-POWER PRINCIPLE: Describe authority, relevance, accessibility and ability to route the seller internally as semantic evidence dimensions. Do not rank contacts or declare a winning contact; deterministic Genesis/UDOSIB logic owns ordering.",
      "ROUTE-RESILIENCE PRINCIPLE: Prefer a primary route plus an independent fallback. Do not present three fragile variants of the same departmental path as route diversity.",
      "Treat Company Discovery, company evidence and Business DNA as established context. Do not repeat generic fit research.",
      "GENESIS CONSTRAINT CONTRACT: business.genesisConstraintContracts is immutable seller-context state. Use it as a fixed reasoning boundary. Never reclassify or invent seller constraints. Respect BOUNDARY constraints, use SUPPORTING constraints as evidence of coherence, treat LIMITING constraints as restrictions rather than automatic impossibility, and expose UNKNOWN constraints as unresolved research debt.",
      "On the FIRST pass establish reachability early: supported direct emails, exact LinkedIn profiles, departmental/general monitored inboxes, switchboard numbers and introduction paths. Then map the minimum useful hierarchy/buying centres and connect people/channels to buying paths. A single contact is not an account strategy.",
      "priorRouteMemory is a lead, not fresh proof. Re-check cited public evidence where possible, preserve supported routes that remain valid and explicitly flag routes that can no longer be verified.",
      "On expansion passes prioritise genuinely new independent access paths and official source URLs not already represented. Rereading the same URL is not research progress unless necessary to revalidate a known route.",
      "Research only real, currently supportable decision-makers, champions, influencers, introducers and monitored company routes at the supplied approved company.",
      "Use official company pages, official LinkedIn company/individual pages, official press releases, public regulatory filings or official staff directories. Never use people-search databases, scraped personal databases, data brokers, random directories or unverifiable snippets.",
      "Never invent a person, title, department, location, email, LinkedIn URL, phone number, source, quote, employment status, reporting line or budget.",
      "A named contact needs independent evidence for both identity and current role. Return uncertainty rather than guessing.",
      "For a named email: VERIFIED requires the exact address on an official source. LIKELY is allowed only where an official company-domain convention is explicitly evidenced; explain the pattern and never call it verified. Otherwise UNKNOWN/null.",
      "Search official public sources for useful company-domain business email routes as well as named routes. Describe likely reader, operational relevance, response likelihood and routing evidence, but do not rank the routes; deterministic Genesis/UDOSIB logic owns ordering.",
      "A PUBLIC_VERIFIED company channel must show the exact address/number on the cited official page. PATTERN_LIKELY is allowed only when official evidence demonstrates the convention. Never manufacture an address from a name.",
      "For LinkedIn, return a direct linkedin.com/in URL only when name, employer and role match. VERIFIED needs strong direct evidence; HIGH_CONFIDENCE is allowed only when the match is strong but not independently confirmed. Otherwise UNKNOWN/null.",
      "Provide EMAIL and LINKEDIN evidence whenever those channels are returned; evidence must support the stated status.",
      "Generate route diversity where evidence supports it: operational, commercial, transformation, procurement, technical, executive, regional, introduction and fallback. Assess semantic dimensions such as authority, accessibility, relevance, evidence, resilience and confidence, but never calculate route rank or select the primary route; deterministic Genesis/UDOSIB logic owns ranking.",
      "A route may be useful without a named person when a verified department/general channel, switchboard or introduction path exists, but never mark unsupported reachability as executable.",
      "Before finalising, challenge the primary contact/route: identify whether someone one level lower would be sufficiently authorised and more relevant, or one level higher is actually required by the likely commitment. Prefer the closest justified level.",
      "Return at most 8 well-supported people, 10 commercial routes and 10 company channels. Everything outside your accountability belongs to another executive or deterministic MarketRoute. Do not assume another role merely to complete the task. Write calm British English.",
      "Prompt policy: contact-discovery/v5-responsibility-boundary."
    ].join(" "),
    input:JSON.stringify(compactInput),tools:[{type:"web_search_preview",search_context_size:input.routeExpansionPass===0?"medium":"low"}],
    reasoning:{effort:profile.reasoningEffort},
    text:{format:{type:"json_schema",name:"salespilot_contact_discovery_v3",strict:true,schema}},max_output_tokens:profile.maxOutputTokens,store:false
  })});}catch(error){if(isOpenAIBackgroundPending(error))throw error;const transport=classifyOpenAITransportError(error,routeTask,requestTimeoutMs);await completeAiRequest({ledgerId:reservation.ledgerId,ok:false,durationMs:Date.now()-startedAt,errorCode:transport.code,errorMessage:transport.error.message}).catch(()=>undefined);throw transport.error;}
  const json:unknown=await response.json().catch(()=>null);
  if(!response.ok){await completeAiRequest({ledgerId:reservation.ledgerId,ok:false,usage:responseUsage(json),webSearchCalls:1,durationMs:Date.now()-startedAt,responseId:typeof (json as any)?.id==="string"?(json as any).id:null,errorCode:`HTTP_${response.status}`,errorMessage:JSON.stringify((json as any)?.error??null)}).catch(()=>undefined);throw new Error(`OPENAI_CONTACT_DISCOVERY_FAILED:${response.status}:${JSON.stringify((json as any)?.error??null)}`);}
  let parsed:ReturnType<typeof ContactDiscoveryResultSchema.parse>;
  try{
    const gateway=await parseStructuredAiResponse({response:json,schema:ContactDiscoveryGatewaySchema,jsonSchema:schema,schemaName:"salespilot_contact_discovery_v3",apiKey,model});
    parsed=canonicaliseContactDiscoveryOutput(gateway.value,String(input.company.id??input.company.company_id??""));
  }catch(error){await discardOpenAIBackgroundResponse({organisationId:input.organisationId,campaignId:input.campaignId,jobType:"CONTACT_DISCOVERY",jobId:input.jobId,requestScope:`contact-discovery:${fingerprint}`}).catch(()=>undefined);const safe=safeStructuredAiError(error);await completeAiRequest({ledgerId:reservation.ledgerId,ok:false,usage:responseUsage(json),webSearchCalls:1,durationMs:Date.now()-startedAt,responseId:typeof (json as any)?.id==="string"?(json as any).id:null,errorCode:safe.code,errorMessage:safe.message}).catch(()=>undefined);throw new Error(`CONTACT_DISCOVERY_RESPONSE_${safe.code}`);}
  if(parsed.companyId!==String(input.company.id))throw new Error("CONTACT_DISCOVERY_COMPANY_MISMATCH");
  await completeAiRequest({ledgerId:reservation.ledgerId,ok:true,usage:responseUsage(json),webSearchCalls:1,durationMs:Date.now()-startedAt,responseId:typeof (json as any)?.id==="string"?(json as any).id:null});
  return normaliseContactDiscoveryResult(parsed,String(input.company.website_url??""));
}

// Backward-compatible alias for older call sites and migrations.
export const discoverContacts = researchRouteIntelligence;

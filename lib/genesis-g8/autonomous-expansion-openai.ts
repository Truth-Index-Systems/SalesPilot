import "server-only";

import { databaseRequest } from "@/lib/database/postgrest";
import { discardOpenAIBackgroundResponse, fetchResumableOpenAIResponse, isOpenAIBackgroundPending, isOpenAIBackgroundTerminal } from "@/lib/ai/background-response";
import { completeAiRequest, reserveAiRequest, responseUsage } from "@/lib/ai/governance";
import { canonicaliseWithAi, decodeAiJson, type HardAcceptance } from "./ai-canonicalisation";
import { aiWorkloadProfile } from "@/lib/ai/workload-profile";
import { aiRequestTimeoutMs, classifyOpenAITransportError } from "@/lib/ai/request-policy";
import { stableFingerprint } from "@/lib/ai/cost-optimisation";
import { assertOpenAiStrictJsonSchema } from "@/lib/ai/strict-json-schema";
import { resolveOpenAIModel } from "@/lib/intelligence/model-router";
import type { GenesisG8EvidenceSourceClass as EvidenceSourceClass } from "./evidence-types";

export const GENESIS_G82_EXPANSION_RESEARCH_VERSION = "G8.2-MRTI2-B8.3.5-DISPATCH-AUDIT-4.1" as const;

function expansionDecision(stage:string, detail:Record<string,unknown>={}){
  console.info("GENESIS_G82_EXPANSION_DECISION",{stage,...detail});
}

export const GENESIS_G82_EXPANSION_COMPANIES_PER_CALL = 3 as const;

const SOURCE_CLASSES = [
  "REGULATORY_OR_GOVERNMENT", "OFFICIAL_PRIMARY", "OFFICIAL_PROFILE", "MAJOR_REPUTABLE_MEDIA",
  "INDUSTRY_PUBLICATION", "COMMERCIAL_DATABASE", "BUSINESS_DIRECTORY", "SOCIAL_OR_COMMUNITY",
  "SEARCH_SNIPPET", "UNKNOWN",
] as const;
const SOURCE_CLASS_SET = new Set<string>(SOURCE_CLASSES);
const EXPANSION_CLAIM_KEYS = new Set(["identity","canonical_domain","current_operation","industry","sector","geography"]);

export type GenesisG82ExpansionEvidence = { claimKey:string; sourceClass:EvidenceSourceClass; sourceUrl:string; sourceTitle:string|null; excerpt:string; directness:number; authority:number; traceability:number; direction:"SUPPORT"|"CONTRADICT"; sourcePublishedAt:string|null; sourceLineageKey:string; derivativeOfLineageKey:string|null; derivativeDepth:number };
export type GenesisG82ExpansionCompany = { name:string; domain:string; sector:string|null; geography:string|null; offering:string|null; customerMarket:string|null; evidence:GenesisG82ExpansionEvidence[] };
export type GenesisG82ExpansionResult = { schemaVersion:"genesis-g82-expansion/v1"; summary:string; companies:GenesisG82ExpansionCompany[] };

function record(value:unknown):Record<string,unknown>|null{return value!==null&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:null;}
function text(value:unknown,max:number):string|null{return typeof value==="string"&&value.length>0&&value.length<=max?value:null;}
function nullableText(value:unknown,max:number):string|null|undefined{return value===null?null:text(value,max)??undefined;}
function boundedInt(value:unknown,min:number,max:number):number|null{return typeof value==="number"&&Number.isInteger(value)&&value>=min&&value<=max?value:null;}
function validUrl(value:unknown):value is string{if(typeof value!=="string"||!value)return false;try{const u=new URL(value);return u.protocol==="http:"||u.protocol==="https:";}catch{return false;}}

function acceptEvidence(value:unknown,path:string,issues:string[]):GenesisG82ExpansionEvidence|null{
  const row=record(value); if(!row){issues.push(`${path}:object`);return null;}
  const claimKey=text(row.claimKey,80); const sourceClass=typeof row.sourceClass==="string"&&SOURCE_CLASS_SET.has(row.sourceClass)?row.sourceClass as EvidenceSourceClass:null;
  const excerpt=text(row.excerpt,420); const directness=boundedInt(row.directness,0,100); const authority=boundedInt(row.authority,0,100); const traceability=boundedInt(row.traceability,0,100);
  const direction=row.direction==="SUPPORT"||row.direction==="CONTRADICT"?row.direction:null; const sourceTitle=nullableText(row.sourceTitle,240);
  const sourcePublishedAt=row.sourcePublishedAt===null?null:typeof row.sourcePublishedAt==="string"?row.sourcePublishedAt:undefined;
  const sourceLineageKey=text(row.sourceLineageKey,240); const derivativeOfLineageKey=row.derivativeOfLineageKey===null?null:text(row.derivativeOfLineageKey,240)??undefined; const derivativeDepth=boundedInt(row.derivativeDepth,0,20);
  if(!claimKey||!EXPANSION_CLAIM_KEYS.has(claimKey))issues.push(`${path}.claimKey`); if(!sourceClass)issues.push(`${path}.sourceClass`); if(!validUrl(row.sourceUrl))issues.push(`${path}.sourceUrl`); if(!excerpt)issues.push(`${path}.excerpt`);
  if(directness===null)issues.push(`${path}.directness`); if(authority===null)issues.push(`${path}.authority`); if(traceability===null)issues.push(`${path}.traceability`); if(!direction)issues.push(`${path}.direction`);
  if(sourceTitle===undefined)issues.push(`${path}.sourceTitle`); if(sourcePublishedAt===undefined)issues.push(`${path}.sourcePublishedAt`); if(!sourceLineageKey)issues.push(`${path}.sourceLineageKey`); if(derivativeOfLineageKey===undefined)issues.push(`${path}.derivativeOfLineageKey`); if(derivativeDepth===null)issues.push(`${path}.derivativeDepth`);
  if(!claimKey||!EXPANSION_CLAIM_KEYS.has(claimKey)||!sourceClass||!validUrl(row.sourceUrl)||!excerpt||directness===null||authority===null||traceability===null||!direction||sourceTitle===undefined||sourcePublishedAt===undefined||!sourceLineageKey||derivativeOfLineageKey===undefined||derivativeDepth===null)return null;
  return {claimKey,sourceClass,sourceUrl:row.sourceUrl,sourceTitle,excerpt,directness,authority,traceability,direction,sourcePublishedAt,sourceLineageKey,derivativeOfLineageKey,derivativeDepth};
}

export function hardAcceptGenesisG82Expansion(value:unknown):HardAcceptance<GenesisG82ExpansionResult>{
  const issues:string[]=[]; const root=record(value); if(!root)return {value:null,issues:["root:object"]};
  if(root.schemaVersion!=="genesis-g82-expansion/v1")issues.push("schemaVersion"); const summary=typeof root.summary==="string"&&root.summary.length<=320?root.summary:null; if(summary===null)issues.push("summary");
  const rawCompanies=Array.isArray(root.companies)?root.companies.slice(0,GENESIS_G82_EXPANSION_COMPANIES_PER_CALL):[]; if(!Array.isArray(root.companies))issues.push("companies:array");
  const companies:GenesisG82ExpansionCompany[]=[];
  rawCompanies.forEach((rawCompany,index)=>{
    const row=record(rawCompany); if(!row){issues.push(`companies[${index}]:object`);return;}
    const name=text(row.name,220); const domain=text(row.domain,240); const sector=nullableText(row.sector,180); const geography=nullableText(row.geography,180); const offering=nullableText(row.offering,320); const customerMarket=nullableText(row.customerMarket,320);
    if(!name)issues.push(`companies[${index}].name`); if(!domain)issues.push(`companies[${index}].domain`); if(sector===undefined)issues.push(`companies[${index}].sector`); if(geography===undefined)issues.push(`companies[${index}].geography`); if(offering===undefined)issues.push(`companies[${index}].offering`); if(customerMarket===undefined)issues.push(`companies[${index}].customerMarket`);
    const evidenceIssuesBefore=issues.length; const evidence=(Array.isArray(row.evidence)?row.evidence:[]).slice(0,4).map((item,e)=>acceptEvidence(item,`companies[${index}].evidence[${e}]`,issues)).filter((item):item is GenesisG82ExpansionEvidence=>item!==null);
    if(evidence.length<2)issues.push(`companies[${index}].evidence:min2`);
    if(name&&domain&&sector!==undefined&&geography!==undefined&&offering!==undefined&&customerMarket!==undefined&&evidence.length>=2){companies.push({name,domain,sector,geography,offering,customerMarket,evidence});}
    else if(issues.length===evidenceIssuesBefore)issues.push(`companies[${index}]:hard-gate`);
  });
  const result=root.schemaVersion==="genesis-g82-expansion/v1"&&summary!==null&&companies.length>0?{schemaVersion:"genesis-g82-expansion/v1" as const,summary,companies}:null;
  return {value:result,issues};
}

const evidenceJson = {
  type: "object", additionalProperties: false,
  required: ["claimKey","sourceClass","sourceUrl","sourceTitle","excerpt","directness","authority","traceability","direction","sourcePublishedAt","sourceLineageKey","derivativeOfLineageKey","derivativeDepth"],
  properties: {
    claimKey: { type: "string" },
    sourceClass: { type: "string", enum: SOURCE_CLASSES },
    sourceUrl: { type: "string" }, sourceTitle: { type: ["string","null"] }, excerpt: { type: "string" },
    directness: { type: "integer", minimum: 0, maximum: 100 },
    authority: { type: "integer", minimum: 0, maximum: 100 },
    traceability: { type: "integer", minimum: 0, maximum: 100 },
    direction: { type: "string", enum: ["SUPPORT","CONTRADICT"] },
    sourcePublishedAt: { type: ["string","null"] },
    sourceLineageKey: { type: "string" },
    derivativeOfLineageKey: { type: ["string","null"] },
    derivativeDepth: { type: "integer", minimum: 0, maximum: 20 },
  },
} as const;
const expansionJsonSchema = {
  type: "object", additionalProperties: false, required: ["schemaVersion","summary","companies"],
  properties: {
    schemaVersion: { type: "string", enum: ["genesis-g82-expansion/v1"] }, summary: { type: "string" },
    companies: { type: "array", maxItems: GENESIS_G82_EXPANSION_COMPANIES_PER_CALL, items: {
      type: "object", additionalProperties: false,
      required: ["name","domain","sector","geography","offering","customerMarket","evidence"],
      properties: {
        name: { type: "string" },
        domain: { type: "string" },
        sector: { type: ["string","null"] },
        geography: { type: ["string","null"] },
        offering: { type: ["string","null"] },
        customerMarket: { type: ["string","null"] },
        evidence: { type: "array", maxItems: 4, items: evidenceJson },
      },
    } },
  },
} as const;

assertOpenAiStrictJsonSchema(expansionJsonSchema, "genesis_g82_expansion_v1");

type CompletedExpansionCheckpoint = {
  response_id:string;
  ledger_id:string;
  response_json:unknown;
  request_scope:string;
  created_at:string;
};

type LedgerStatusRow = { id:string; status:string };

async function recoverCompletedExpansionResponse(params:{
  jobId:string; apiKey:string; model:string;
}):Promise<GenesisG82ExpansionResult|null>{
  const rows=await databaseRequest<CompletedExpansionCheckpoint[]>(
    `ai_background_responses?job_type=eq.GENESIS_G82_EXPANSION&job_id=eq.${encodeURIComponent(params.jobId)}&request_scope=like.genesis-g82-expansion-v4:*&status=eq.completed&response_json=not.is.null&select=response_id,ledger_id,response_json,request_scope,created_at&order=created_at.asc&limit=12`,
  ).catch(()=>[]);
  let recovered:GenesisG82ExpansionResult|null=null;
  for(const row of rows){
    const ledger=await databaseRequest<LedgerStatusRow[]>(`ai_usage_ledger?id=eq.${encodeURIComponent(row.ledger_id)}&select=id,status&limit=1`).catch(()=>[]);
    if(ledger[0]?.status!=="RESERVED"&&ledger[0]?.status!=="SUCCEEDED") continue;
    try{
      let accepted:HardAcceptance<GenesisG82ExpansionResult>;
      try{accepted=hardAcceptGenesisG82Expansion(decodeAiJson(row.response_json));}catch(error){accepted={value:null,issues:[error instanceof Error?error.message:"AI_OUTPUT_JSON_INVALID"]};}
      if(ledger[0]?.status==="RESERVED") await completeAiRequest({ledgerId:row.ledger_id,ok:true,usage:responseUsage(row.response_json),webSearchCalls:1,durationMs:0,responseId:row.response_id});
      if(accepted.value&&accepted.issues.length===0){if(!recovered)recovered=accepted.value;continue;}
      const canonical=await canonicaliseWithAi({apiKey:params.apiKey,model:params.model,organisationId:process.env.MARKETROUTE_G8_SYSTEM_ORGANISATION_ID?.trim()??null,jobType:"GENESIS_G82_EXPANSION",task:"GENESIS_G82_EXPANSION",jobId:params.jobId,parentScope:row.request_scope,rawResponse:row.response_json,schemaName:"genesis_g82_expansion_v1",jsonSchema:expansionJsonSchema,instructions:"Canonicalise a breadth-first expansion batch. Keep only company foundations and 2-4 high-value company evidence items. Remove contacts/routes and unsupported narrative. Preserve exact source provenance.",accept:hardAcceptGenesisG82Expansion});
      if(!recovered&&canonical.companies.length>0)recovered=canonical;
    }catch(error){
      console.warn("Expansion AI canonicalisation pending or failed",error instanceof Error?error.message:String(error));
      if(isOpenAIBackgroundPending(error)){expansionDecision("CANONICALISATION_PENDING",{jobId:params.jobId,requestScope:row.request_scope,error:error instanceof Error?error.message:String(error)});throw error;}
    }
  }
  return recovered;
}

export async function researchGenesisG82IndustryExpansion(input:{
  jobId:string; industryKey:string; industryName:string; excludedDomains:string[]; attemptNumber?:number;
}):Promise<GenesisG82ExpansionResult>{
  const apiKey=process.env.OPENAI_API_KEY?.trim(); if(!apiKey) throw new Error("OPENAI_API_KEY_NOT_CONFIGURED");
  const organisationId=process.env.MARKETROUTE_G8_SYSTEM_ORGANISATION_ID?.trim()??null;
  const model=resolveOpenAIModel("analysis").model;
  const recovered=await recoverCompletedExpansionResponse({jobId:input.jobId,apiKey,model});
  if(recovered) return recovered;
  // Build 8.3.2: expansion has its own background-response identity. Governance still applies
  // the same workspace spend and parallelism limits, but repair and expansion checkpoints can never collide.
  const profile=aiWorkloadProfile("GENESIS_G82_EXPANSION");
  const timeoutMs=aiRequestTimeoutMs("GENESIS_G82_EXPANSION");
  const attemptNumber=Math.max(0,Math.trunc(input.attemptNumber??0));
  const searchAngles=["emerging and recently funded operators","established scale-ups","regional specialists","B2B category operators","independent growth companies"] as const;
  const searchAngle=searchAngles[attemptNumber%searchAngles.length];
  const fingerprint=stableFingerprint({version:GENESIS_G82_EXPANSION_RESEARCH_VERSION,jobId:input.jobId,industryKey:input.industryKey,attemptNumber,searchAngle});
  const baseScope=`genesis-g82-expansion-v4:${fingerprint}`;
  let requestScope=baseScope; let lastTerminalError:Error|null=null;
  const estimatedCostUsd=Math.max(0.01,Number(process.env.MARKETROUTE_G82_EXPANSION_ESTIMATED_COST_USD??"0.08")||0.08);
  for(let generation=0;generation<3;generation++){
    const recoveryPass=generation>0;
    expansionDecision("AI_RESERVATION_REQUEST",{jobId:input.jobId,requestScope,generation,recoveryPass});
    const reservation=await reserveAiRequest({organisationId,campaignId:null,jobType:"GENESIS_G82_EXPANSION",jobId:input.jobId,requestScope,model,estimatedCostUsd});
    expansionDecision("AI_RESERVATION_GRANTED",{jobId:input.jobId,requestScope,ledgerId:reservation.ledgerId,generation});
    const startedAt=Date.now(); let response:Response;
    try{
      expansionDecision("BACKGROUND_FETCH_OR_SUBMIT",{jobId:input.jobId,requestScope,generation});
      response=await fetchResumableOpenAIResponse({apiKey,task:"GENESIS_G82_EXPANSION",organisationId,campaignId:null,jobType:"GENESIS_G82_EXPANSION",jobId:input.jobId,requestScope,model,ledgerId:reservation.ledgerId},{
        method:"POST",cache:"no-store",signal:AbortSignal.timeout(timeoutMs),headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},
        body:JSON.stringify({
          model,
          instructions:[
            "ROLE: Genesis autonomous public-commercial intelligence researcher for MarketRoute.",
            recoveryPass
              ? "MISSION: RECOVERY PASS. The previous enriched search produced no usable companies. Broaden discovery and find real NEW companies first. Prioritise verified company identity/domain/current-operation evidence; do not research contact or route depth. Do not spend the pass trying to enrich a company before establishing a valid company batch."
              : "MISSION: Expand one named industry by finding a compact batch of real companies Genesis does not already know. Use the web-search context efficiently across the whole batch rather than restarting the same market research for each company. Evidence first; never assign Truth Index, approval state, fit score, opportunity score or outreach.",
            `SEARCH ANGLE: ${searchAngle}. Search this slice deliberately before broadening further.`,
            "NOVELTY: Do not return any domain in excludedDomains. Prefer active companies/startups with a clear official web presence and commercially useful public information.",
            "BREADTH-FIRST CONTRACT: This call creates company foundations only. Do not research or return contacts, people, email addresses, LinkedIn profiles, routes, forms, outreach paths or decision makers. Those belong to downstream MR-TI-2 repair/depth workers.",
            "COMPANY CLAIM KEYS: expansion evidence may use only identity, canonical_domain, current_operation, industry, sector or geography. Do not spend this pass proving offering, customer_market, company_scale or buying_signals; leave offering/customerMarket null unless immediately obvious from the same official source.",
            "MR-TI-2 CONTRACT: You are collecting primitive evidence inputs for deterministic MR-TI-2.0. Never calculate Truth Index, claim probability, coverage, freshness, independence or foundational integrity. For every evidence item classify SUPPORT/CONTRADICT and return authority, directness and traceability as 0-100 primitive observations, plus sourcePublishedAt when known, sourceLineageKey, derivativeOfLineageKey and derivativeDepth. Root/original evidence has derivativeDepth 0 and no derivative parent. Repeated/copied evidence must identify its lineage so the engine can apply exponential independence decay.",
            "SOURCES: Prefer official sites, government/regulatory sources and official profiles. Give exact public URLs and traceable excerpts. Never invent an email, role, URL or company.",
            recoveryPass
              ? "BOUNDARY: Return up to three distinct verifiable companies. For each company return only 2-4 company-level evidence items, using the smallest set that establishes identity/domain/current operation and industry or geography. Each excerpt must be concise (target <= 280 characters). Return companies: [] only after genuinely searching multiple queries in the requested search angle and finding no new verifiable domains."
              : "BOUNDARY: Return up to three distinct companies, prioritising three when evidence permits. Exactly 2-4 high-value company-level evidence items per company; do not duplicate the same source lineage merely to fill the evidence array. Keep excerpts <= 280 characters and summaries brief. Never pad with weak companies.",
            "OUTPUT BUDGET: Optimise for completion, not richness. Three compact verified company foundations are more valuable than one deeply enriched company. Do not include narrative beyond the required JSON fields.",
            "Write concise British English and return exact JSON only. Prompt policy: genesis-g82-expansion/v4-ai-canonical-first.",
          ].join(" "),
          input:JSON.stringify({industryKey:input.industryKey,industryName:input.industryName,searchAngle,recoveryPass,attemptNumber,excludedDomains:input.excludedDomains.slice(0,180)}),
          tools:[{type:"web_search_preview",search_context_size:"medium"}],reasoning:{effort:profile.reasoningEffort},
          text:{format:{type:"json_schema",name:"genesis_g82_expansion_v1",strict:true,schema:expansionJsonSchema}},
          max_output_tokens:Math.max(profile.maxOutputTokens,4500),store:false,
        }),
      });
    }catch(error){
      if(isOpenAIBackgroundPending(error)){expansionDecision("BACKGROUND_PENDING",{jobId:input.jobId,requestScope,error:error instanceof Error?error.message:String(error)}); throw error;}
      if(isOpenAIBackgroundTerminal(error)){
        const reason=error.providerReason??`Provider response ended ${error.status}`;
        await completeAiRequest({ledgerId:reservation.ledgerId,ok:false,durationMs:Date.now()-startedAt,responseId:error.responseId,errorCode:`OPENAI_BACKGROUND_${error.status.toUpperCase()}`,errorMessage:reason}).catch(()=>undefined);
        expansionDecision("BACKGROUND_TERMINAL",{jobId:input.jobId,requestScope,status:error.status,reason,responseId:error.responseId});
        lastTerminalError=new Error(`GENESIS_G82_EXPANSION_BACKGROUND_TERMINAL:${error.status}:${reason}`);
        requestScope=`${baseScope}:retry:${stableFingerprint({previousScope:requestScope,responseId:error.responseId})}`; continue;
      }
      const transport=classifyOpenAITransportError(error,"GENESIS_G82_EXPANSION",timeoutMs);
      await completeAiRequest({ledgerId:reservation.ledgerId,ok:false,durationMs:Date.now()-startedAt,errorCode:transport.code,errorMessage:transport.error.message}).catch(()=>undefined); throw transport.error;
    }
    const json:unknown=await response.json().catch(()=>null); const responseId=typeof (json as any)?.id==="string"?(json as any).id:null;
    expansionDecision("BACKGROUND_RESPONSE_AVAILABLE",{jobId:input.jobId,requestScope,responseId,status:(json as any)?.status??"unknown",httpStatus:response.status});
    if(!response.ok){await completeAiRequest({ledgerId:reservation.ledgerId,ok:false,usage:responseUsage(json),webSearchCalls:1,durationMs:Date.now()-startedAt,responseId,errorCode:`HTTP_${response.status}`,errorMessage:JSON.stringify((json as any)?.error??null)}).catch(()=>undefined);throw new Error(`GENESIS_G82_EXPANSION_OPENAI_FAILED:${response.status}`);}
    if((json as any)?.status==="incomplete"){
      const reason=typeof (json as any)?.incomplete_details?.reason==="string"?(json as any).incomplete_details.reason:"UNKNOWN";
      await completeAiRequest({ledgerId:reservation.ledgerId,ok:false,usage:responseUsage(json),webSearchCalls:1,durationMs:Date.now()-startedAt,responseId,errorCode:"INCOMPLETE_RESPONSE",errorMessage:reason}).catch(()=>undefined);
      if(responseId){expansionDecision("PROVIDER_INCOMPLETE_RETRY",{jobId:input.jobId,requestScope,responseId,reason});lastTerminalError=new Error(`GENESIS_G82_EXPANSION_INCOMPLETE:${reason}`);requestScope=`${baseScope}:retry:${stableFingerprint({previousScope:requestScope,responseId})}`;continue;} throw lastTerminalError??new Error(`GENESIS_G82_EXPANSION_INCOMPLETE:${reason}`);
    }
    await completeAiRequest({ledgerId:reservation.ledgerId,ok:true,usage:responseUsage(json),webSearchCalls:1,durationMs:Date.now()-startedAt,responseId});
    let accepted:HardAcceptance<GenesisG82ExpansionResult>;
    try{accepted=hardAcceptGenesisG82Expansion(decodeAiJson(json));}catch(error){accepted={value:null,issues:[error instanceof Error?error.message:"AI_OUTPUT_JSON_INVALID"]};}
    if(accepted.value&&accepted.issues.length===0){expansionDecision("HARD_GATE_ACCEPTED",{jobId:input.jobId,requestScope,companies:accepted.value.companies.length});return accepted.value;}
    expansionDecision("HARD_GATE_CANONICALISATION_REQUIRED",{jobId:input.jobId,requestScope,issues:accepted.issues.slice(0,8),hasPartialValue:Boolean(accepted.value),partialCompanies:accepted.value?.companies.length??0});
    try{
      expansionDecision("CANONICALISATION_START",{jobId:input.jobId,requestScope});
      const canonical=await canonicaliseWithAi({apiKey,model,organisationId,jobType:"GENESIS_G82_EXPANSION",task:"GENESIS_G82_EXPANSION",jobId:input.jobId,parentScope:requestScope,rawResponse:json,schemaName:"genesis_g82_expansion_v1",jsonSchema:expansionJsonSchema,instructions:"Canonicalise the research into up to three company foundations. Keep exactly the evidence already supported by the supplied research, use only the allowed company claim keys, preserve source URLs/lineage, and omit all contact/route depth.",accept:hardAcceptGenesisG82Expansion});
      if(canonical.companies.length>0){expansionDecision("CANONICALISATION_ACCEPTED",{jobId:input.jobId,requestScope,companies:canonical.companies.length});return canonical;}
    }catch(error){
      if(isOpenAIBackgroundPending(error)){expansionDecision("CANONICALISATION_PENDING",{jobId:input.jobId,requestScope,error:error instanceof Error?error.message:String(error)});throw error;}
      console.warn("Expansion AI canonicalisation failed",{issues:accepted.issues.slice(0,8),error:error instanceof Error?error.message:String(error)});
      if(accepted.value&&accepted.value.companies.length>0)return accepted.value;
    }
    expansionDecision("DISCARD_CHECKPOINT",{jobId:input.jobId,requestScope,generation});
    await discardOpenAIBackgroundResponse({organisationId,campaignId:null,jobType:"GENESIS_G82_EXPANSION",jobId:input.jobId,requestScope}).catch(()=>undefined);
    if(generation===0){requestScope=`${baseScope}:breadth-recovery:${attemptNumber}`;continue;}
    throw new Error(`GENESIS_G82_EXPANSION_HARD_GATE_EMPTY:${input.industryKey}:${searchAngle}`);
  }
  throw lastTerminalError??new Error("GENESIS_G82_EXPANSION_TERMINAL_RETRY_LIMIT");
}

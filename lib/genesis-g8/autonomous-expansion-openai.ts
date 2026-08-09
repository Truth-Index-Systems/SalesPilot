import "server-only";

import { z } from "zod";
import { databaseRequest } from "@/lib/database/postgrest";
import { discardOpenAIBackgroundResponse, fetchResumableOpenAIResponse, isOpenAIBackgroundPending, isOpenAIBackgroundTerminal } from "@/lib/ai/background-response";
import { completeAiRequest, reserveAiRequest, responseUsage } from "@/lib/ai/governance";
import { parseStructuredAiResponse, safeStructuredAiError } from "@/lib/ai/structured-response-gateway";
import { aiPromptCacheKey, aiWorkloadProfile } from "@/lib/ai/workload-profile";
import { aiRequestTimeoutMs, classifyOpenAITransportError } from "@/lib/ai/request-policy";
import { stableFingerprint } from "@/lib/ai/cost-optimisation";
import { assertOpenAiStrictJsonSchema } from "@/lib/ai/strict-json-schema";
import { resolveOpenAIModel } from "@/lib/intelligence/model-router";
import type { GenesisG8EvidenceSourceClass as EvidenceSourceClass } from "./evidence-types";

export const GENESIS_G82_EXPANSION_RESEARCH_VERSION = "G8.2-MRTI2-B8.3.2-NAMESPACE-ISOLATION-2.0" as const;

export const GENESIS_G82_EXPANSION_COMPANIES_PER_CALL = 3 as const;

const SourceClassSchema = z.enum([
  "REGULATORY_OR_GOVERNMENT", "OFFICIAL_PRIMARY", "OFFICIAL_PROFILE", "MAJOR_REPUTABLE_MEDIA",
  "INDUSTRY_PUBLICATION", "COMMERCIAL_DATABASE", "BUSINESS_DIRECTORY", "SOCIAL_OR_COMMUNITY",
  "SEARCH_SNIPPET", "UNKNOWN",
]);
const EvidenceSchema = z.object({
  claimKey: z.string().min(1).max(80),
  sourceClass: SourceClassSchema,
  sourceUrl: z.string().url(),
  sourceTitle: z.string().max(240).nullable(),
  excerpt: z.string().min(1).max(700),
  directness: z.number().int().min(0).max(100),
  authority: z.number().int().min(0).max(100),
  traceability: z.number().int().min(0).max(100),
  direction: z.enum(["SUPPORT","CONTRADICT"]),
  sourcePublishedAt: z.string().datetime({offset:true}).nullable(),
  sourceLineageKey: z.string().min(1).max(240),
  derivativeOfLineageKey: z.string().min(1).max(240).nullable(),
  derivativeDepth: z.number().int().min(0).max(20),
});
const ContactSchema = z.object({
  name: z.string().min(1).max(180), role: z.string().max(180).nullable(), seniority: z.string().max(120).nullable(),
  linkedinUrl: z.string().url().nullable(), email: z.string().email().nullable(), evidence: z.array(EvidenceSchema).max(6),
});
const RouteSchema = z.object({
  label: z.string().min(1).max(220), targetRole: z.string().max(180).nullable(), channelType: z.string().max(80),
  channelValue: z.string().max(500).nullable(), routePath: z.string().max(500).nullable(), evidence: z.array(EvidenceSchema).max(6),
});
const CompanySchema = z.object({
  name: z.string().min(1).max(220), domain: z.string().min(3).max(240), sector: z.string().max(180).nullable(),
  geography: z.string().max(180).nullable(), offering: z.string().max(500).nullable(), customerMarket: z.string().max(500).nullable(),
  evidence: z.array(EvidenceSchema).min(2).max(10), contacts: z.array(ContactSchema).max(2), routes: z.array(RouteSchema).max(1),
});
const ExpansionResultSchema = z.object({
  schemaVersion: z.literal("genesis-g82-expansion/v1"),
  summary: z.string().max(800),
  companies: z.array(CompanySchema).max(GENESIS_G82_EXPANSION_COMPANIES_PER_CALL),
});

const evidenceJson = {
  type: "object", additionalProperties: false,
  required: ["claimKey","sourceClass","sourceUrl","sourceTitle","excerpt","directness","authority","traceability","direction","sourcePublishedAt","sourceLineageKey","derivativeOfLineageKey","derivativeDepth"],
  properties: {
    claimKey: { type: "string" },
    sourceClass: { type: "string", enum: SourceClassSchema.options },
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
      required: ["name","domain","sector","geography","offering","customerMarket","evidence","contacts","routes"],
      properties: {
        name: { type: "string" }, domain: { type: "string" }, sector: { type: ["string","null"] }, geography: { type: ["string","null"] },
        offering: { type: ["string","null"] }, customerMarket: { type: ["string","null"] }, evidence: { type: "array", maxItems: 10, items: evidenceJson },
        contacts: { type: "array", maxItems: 2, items: { type: "object", additionalProperties: false,
          required: ["name","role","seniority","linkedinUrl","email","evidence"], properties: {
            name: { type: "string" }, role: { type: ["string","null"] }, seniority: { type: ["string","null"] }, linkedinUrl: { type: ["string","null"] }, email: { type: ["string","null"] },
            evidence: { type: "array", maxItems: 6, items: evidenceJson },
          } } },
        routes: { type: "array", maxItems: 1, items: { type: "object", additionalProperties: false,
          required: ["label","targetRole","channelType","channelValue","routePath","evidence"], properties: {
            label: { type: "string" }, targetRole: { type: ["string","null"] }, channelType: { type: "string" }, channelValue: { type: ["string","null"] }, routePath: { type: ["string","null"] },
            evidence: { type: "array", maxItems: 6, items: evidenceJson },
          } } },
      },
    } },
  },
} as const;

assertOpenAiStrictJsonSchema(expansionJsonSchema, "genesis_g82_expansion_v1");

const LegacyCompanySchema = CompanySchema;
const LegacyExpansionResultSchema = z.object({
  schemaVersion: z.literal("genesis-g82-expansion/v1"),
  summary: z.string().max(800),
  companies: z.array(LegacyCompanySchema).max(6),
});

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
    `ai_background_responses?job_type=eq.GENESIS_G82_EXPANSION&job_id=eq.${encodeURIComponent(params.jobId)}&status=eq.completed&response_json=not.is.null&select=response_id,ledger_id,response_json,request_scope,created_at&order=created_at.asc&limit=12`,
  ).catch(()=>[]);
  let recovered:GenesisG82ExpansionResult|null=null;
  for(const row of rows){
    const ledger=await databaseRequest<LedgerStatusRow[]>(`ai_usage_ledger?id=eq.${encodeURIComponent(row.ledger_id)}&select=id,status&limit=1`).catch(()=>[]);
    if(ledger[0]?.status!=="RESERVED") continue;
    try{
      const gateway=await parseStructuredAiResponse({response:row.response_json,schema:LegacyExpansionResultSchema,jsonSchema:{...expansionJsonSchema,properties:{...expansionJsonSchema.properties,companies:{...expansionJsonSchema.properties.companies,maxItems:6}}},schemaName:"genesis_g82_expansion_v1",apiKey:params.apiKey,model:params.model});
      await completeAiRequest({ledgerId:row.ledger_id,ok:true,usage:responseUsage(row.response_json),webSearchCalls:1,durationMs:0,responseId:row.response_id});
      if(!recovered&&gateway.value.companies.length>0){
        recovered={...gateway.value,companies:gateway.value.companies.slice(0,GENESIS_G82_EXPANSION_COMPANIES_PER_CALL)};
      }
    }catch(error){
      const safe=safeStructuredAiError(error);
      await completeAiRequest({ledgerId:row.ledger_id,ok:false,usage:responseUsage(row.response_json),webSearchCalls:1,durationMs:0,responseId:row.response_id,errorCode:`EXPANSION_RECOVERY_${safe.code}`,errorMessage:safe.message}).catch(()=>undefined);
    }
  }
  return recovered;
}

export type GenesisG82ExpansionEvidence = { claimKey:string; sourceClass:EvidenceSourceClass; sourceUrl:string; sourceTitle:string|null; excerpt:string; directness:number; authority:number; traceability:number; direction:"SUPPORT"|"CONTRADICT"; sourcePublishedAt:string|null; sourceLineageKey:string; derivativeOfLineageKey:string|null; derivativeDepth:number };
export type GenesisG82ExpansionResult = z.infer<typeof ExpansionResultSchema>;

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
  const baseScope=`genesis-g82-expansion-v2:${fingerprint}`;
  let requestScope=baseScope; let lastTerminalError:Error|null=null;
  const estimatedCostUsd=Math.max(0.01,Number(process.env.MARKETROUTE_G82_EXPANSION_ESTIMATED_COST_USD??"0.08")||0.08);
  for(let generation=0;generation<3;generation++){
    const recoveryPass=generation>0;
    const reservation=await reserveAiRequest({organisationId,campaignId:null,jobType:"GENESIS_G82_EXPANSION",jobId:input.jobId,requestScope,model,estimatedCostUsd});
    const startedAt=Date.now(); let response:Response;
    try{
      response=await fetchResumableOpenAIResponse({apiKey,task:"GENESIS_G82_EXPANSION",organisationId,campaignId:null,jobType:"GENESIS_G82_EXPANSION",jobId:input.jobId,requestScope,model,ledgerId:reservation.ledgerId},{
        method:"POST",cache:"no-store",signal:AbortSignal.timeout(timeoutMs),headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},
        body:JSON.stringify({
          model,
          instructions:[
            "ROLE: Genesis autonomous public-commercial intelligence researcher for MarketRoute.",
            recoveryPass
              ? "MISSION: RECOVERY PASS. The previous enriched search produced no usable companies. Broaden discovery and find real NEW companies first. Prioritise verified company identity/domain/current-operation evidence; contacts and routes are optional and may be empty. Do not spend the pass trying to enrich a company before establishing a valid company batch."
              : "MISSION: Expand one named industry by finding a compact batch of real companies Genesis does not already know. Use the web-search context efficiently across the whole batch rather than restarting the same market research for each company. Evidence first; never assign Truth Index, approval state, fit score, opportunity score or outreach.",
            `SEARCH ANGLE: ${searchAngle}. Search this slice deliberately before broadening further.`,
            "NOVELTY: Do not return any domain in excludedDomains. Prefer active companies/startups with a clear official web presence and commercially useful public information.",
            "COMPANY CLAIM KEYS: company evidence may use only identity, canonical_domain, current_operation, industry, sector, geography, offering, customer_market, company_scale or buying_signals.",
            "CONTACT CLAIM KEYS: contact evidence may use only identity, company_relationship, current_employment, role, seniority, authority, work_location, linkedin or email. Return contacts only when current public evidence exists.",
            "ROUTE CLAIM KEYS: route evidence may use only target_company, route_identity, entry_point, decision_maker or route_path. Return a route only when there is a public, verifiable path such as a contact page, named role/profile, public email or official form.",
            "MR-TI-2 CONTRACT: You are collecting primitive evidence inputs for deterministic MR-TI-2.0. Never calculate Truth Index, claim probability, coverage, freshness, independence or foundational integrity. For every evidence item classify SUPPORT/CONTRADICT and return authority, directness and traceability as 0-100 primitive observations, plus sourcePublishedAt when known, sourceLineageKey, derivativeOfLineageKey and derivativeDepth. Root/original evidence has derivativeDepth 0 and no derivative parent. Repeated/copied evidence must identify its lineage so the engine can apply exponential independence decay.",
            "SOURCES: Prefer official sites, government/regulatory sources and official profiles. Give exact public URLs and traceable excerpts. Never invent an email, role, URL or company.",
            recoveryPass
              ? "BOUNDARY: Return up to three distinct companies when verifiable companies exist; prioritise three strong companies over a larger weak batch. For each company provide at least two company-level evidence items from exact public URLs. Contacts/routes may be empty. Return companies: [] only after genuinely searching multiple queries in the requested search angle and finding no verifiable new domains."
              : "BOUNDARY: Return up to three distinct companies in this single call, prioritising three when evidence quality permits. Maximum two contacts per company and one route per company. Never pad the batch with weak or duplicate companies; empty nested arrays are valid when evidence is unavailable.",
            "Write concise British English and return exact JSON only. Prompt policy: genesis-g82-expansion/v2-namespace-isolated.",
          ].join(" "),
          input:JSON.stringify({industryKey:input.industryKey,industryName:input.industryName,searchAngle,recoveryPass,attemptNumber,excludedDomains:input.excludedDomains.slice(0,180)}),
          tools:[{type:"web_search_preview",search_context_size:"medium"}],reasoning:{effort:profile.reasoningEffort},
          text:{format:{type:"json_schema",name:"genesis_g82_expansion_v1",strict:true,schema:expansionJsonSchema}},
          max_output_tokens:Math.max(profile.maxOutputTokens,6000),store:false,
        }),
      });
    }catch(error){
      if(isOpenAIBackgroundPending(error)) throw error;
      if(isOpenAIBackgroundTerminal(error)){
        const reason=error.providerReason??`Provider response ended ${error.status}`;
        await completeAiRequest({ledgerId:reservation.ledgerId,ok:false,durationMs:Date.now()-startedAt,responseId:error.responseId,errorCode:`OPENAI_BACKGROUND_${error.status.toUpperCase()}`,errorMessage:reason}).catch(()=>undefined);
        lastTerminalError=new Error(`GENESIS_G82_EXPANSION_BACKGROUND_TERMINAL:${error.status}:${reason}`);
        requestScope=`${baseScope}:retry:${stableFingerprint({previousScope:requestScope,responseId:error.responseId})}`; continue;
      }
      const transport=classifyOpenAITransportError(error,"GENESIS_G82_EXPANSION",timeoutMs);
      await completeAiRequest({ledgerId:reservation.ledgerId,ok:false,durationMs:Date.now()-startedAt,errorCode:transport.code,errorMessage:transport.error.message}).catch(()=>undefined); throw transport.error;
    }
    const json:unknown=await response.json().catch(()=>null); const responseId=typeof (json as any)?.id==="string"?(json as any).id:null;
    if(!response.ok){await completeAiRequest({ledgerId:reservation.ledgerId,ok:false,usage:responseUsage(json),webSearchCalls:1,durationMs:Date.now()-startedAt,responseId,errorCode:`HTTP_${response.status}`,errorMessage:JSON.stringify((json as any)?.error??null)}).catch(()=>undefined);throw new Error(`GENESIS_G82_EXPANSION_OPENAI_FAILED:${response.status}`);}
    if((json as any)?.status==="incomplete"){
      const reason=typeof (json as any)?.incomplete_details?.reason==="string"?(json as any).incomplete_details.reason:"UNKNOWN";
      await completeAiRequest({ledgerId:reservation.ledgerId,ok:false,usage:responseUsage(json),webSearchCalls:1,durationMs:Date.now()-startedAt,responseId,errorCode:"INCOMPLETE_RESPONSE",errorMessage:reason}).catch(()=>undefined);
      if(responseId){lastTerminalError=new Error(`GENESIS_G82_EXPANSION_INCOMPLETE:${reason}`);requestScope=`${baseScope}:retry:${stableFingerprint({previousScope:requestScope,responseId})}`;continue;} throw lastTerminalError??new Error(`GENESIS_G82_EXPANSION_INCOMPLETE:${reason}`);
    }
    try{
      const gateway=await parseStructuredAiResponse({response:json,schema:ExpansionResultSchema,jsonSchema:expansionJsonSchema,schemaName:"genesis_g82_expansion_v1",apiKey,model});
      await completeAiRequest({ledgerId:reservation.ledgerId,ok:true,usage:responseUsage(json),webSearchCalls:1,durationMs:Date.now()-startedAt,responseId});
      if(gateway.value.companies.length===0){
        await discardOpenAIBackgroundResponse({organisationId,campaignId:null,jobType:"GENESIS_G82_EXPANSION",jobId:input.jobId,requestScope}).catch(()=>undefined);
        if(generation===0){
          requestScope=`${baseScope}:breadth-recovery:${attemptNumber}`;
          continue;
        }
        throw new Error(`GENESIS_G82_EXPANSION_EMPTY_AFTER_RECOVERY:${input.industryKey}:${searchAngle}`);
      }
      return gateway.value;
    }catch(error){
      await discardOpenAIBackgroundResponse({organisationId,campaignId:null,jobType:"GENESIS_G82_EXPANSION",jobId:input.jobId,requestScope}).catch(()=>undefined);
      const safe=safeStructuredAiError(error); await completeAiRequest({ledgerId:reservation.ledgerId,ok:false,usage:responseUsage(json),webSearchCalls:1,durationMs:Date.now()-startedAt,responseId,errorCode:safe.code,errorMessage:safe.message}).catch(()=>undefined); throw new Error(`GENESIS_G82_EXPANSION_RESPONSE_${safe.code}`);
    }
  }
  throw lastTerminalError??new Error("GENESIS_G82_EXPANSION_TERMINAL_RETRY_LIMIT");
}

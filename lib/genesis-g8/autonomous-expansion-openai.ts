import "server-only";

import { z } from "zod";
import { discardOpenAIBackgroundResponse, fetchResumableOpenAIResponse, isOpenAIBackgroundPending, isOpenAIBackgroundTerminal } from "@/lib/ai/background-response";
import { completeAiRequest, reserveAiRequest, responseUsage } from "@/lib/ai/governance";
import { parseStructuredAiResponse, safeStructuredAiError } from "@/lib/ai/structured-response-gateway";
import { aiPromptCacheKey, aiWorkloadProfile } from "@/lib/ai/workload-profile";
import { aiRequestTimeoutMs, classifyOpenAITransportError } from "@/lib/ai/request-policy";
import { stableFingerprint } from "@/lib/ai/cost-optimisation";
import { resolveOpenAIModel } from "@/lib/intelligence/model-router";
import type { EvidenceSourceClass } from "./truth";

export const GENESIS_G82_EXPANSION_RESEARCH_VERSION = "G8.2-R1-EXPANSION-RESEARCH-1.0" as const;

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
  companies: z.array(CompanySchema).max(3),
});

const evidenceJson = {
  type: "object", additionalProperties: false, required: ["claimKey","sourceClass","sourceUrl","sourceTitle","excerpt","directness"],
  properties: {
    claimKey: { type: "string" },
    sourceClass: { type: "string", enum: SourceClassSchema.options },
    sourceUrl: { type: "string" }, sourceTitle: { type: ["string","null"] }, excerpt: { type: "string" },
    directness: { type: "integer", minimum: 0, maximum: 100 },
  },
} as const;
const expansionJsonSchema = {
  type: "object", additionalProperties: false, required: ["schemaVersion","summary","companies"],
  properties: {
    schemaVersion: { type: "string", enum: ["genesis-g82-expansion/v1"] }, summary: { type: "string" },
    companies: { type: "array", maxItems: 3, items: {
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

export type GenesisG82ExpansionEvidence = { claimKey:string; sourceClass:EvidenceSourceClass; sourceUrl:string; sourceTitle:string|null; excerpt:string; directness:number };
export type GenesisG82ExpansionResult = z.infer<typeof ExpansionResultSchema>;

export async function researchGenesisG82IndustryExpansion(input:{
  jobId:string; industryKey:string; industryName:string; excludedDomains:string[];
}):Promise<GenesisG82ExpansionResult>{
  const apiKey=process.env.OPENAI_API_KEY?.trim(); if(!apiKey) throw new Error("OPENAI_API_KEY_NOT_CONFIGURED");
  const organisationId=process.env.MARKETROUTE_G8_SYSTEM_ORGANISATION_ID?.trim()??null;
  const model=resolveOpenAIModel("analysis").model;
  // G8.2 R1 deliberately reuses the governed G8 repair lane. It is background intelligence spend,
  // so R17 sees it inside the same protected allowance instead of creating an ungoverned AI lane.
  const profile=aiWorkloadProfile("GENESIS_G8_REPAIR");
  const timeoutMs=aiRequestTimeoutMs("GENESIS_G8_REPAIR");
  const fingerprint=stableFingerprint({version:GENESIS_G82_EXPANSION_RESEARCH_VERSION,industryKey:input.industryKey,excluded:input.excludedDomains.slice(0,250)});
  const baseScope=`genesis-g82-expansion:${fingerprint}`;
  let requestScope=baseScope; let lastTerminalError:Error|null=null;
  const estimatedCostUsd=Math.max(0.01,Number(process.env.MARKETROUTE_G82_EXPANSION_ESTIMATED_COST_USD??"0.08")||0.08);
  for(let generation=0;generation<3;generation++){
    const reservation=await reserveAiRequest({organisationId,campaignId:null,jobType:"GENESIS_G8_REPAIR",jobId:input.jobId,requestScope,model,estimatedCostUsd});
    const startedAt=Date.now(); let response:Response;
    try{
      response=await fetchResumableOpenAIResponse({apiKey,task:"GENESIS_G8_REPAIR",organisationId,campaignId:null,jobType:"GENESIS_G8_REPAIR",jobId:input.jobId,requestScope,model,ledgerId:reservation.ledgerId},{
        method:"POST",cache:"no-store",signal:AbortSignal.timeout(timeoutMs),headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},
        body:JSON.stringify({
          model,
          instructions:[
            "ROLE: Genesis autonomous public-commercial intelligence researcher for MarketRoute.",
            "MISSION: Expand one named industry by finding a very small batch of real companies Genesis does not already know. Evidence first; never assign Truth Index, approval state, fit score, opportunity score or outreach.",
            "NOVELTY: Do not return any domain in excludedDomains. Prefer active companies/startups with a clear official web presence and commercially useful public information.",
            "COMPANY CLAIM KEYS: company evidence may use only identity, canonical_domain, current_operation, industry, sector, geography, offering, customer_market, company_scale or buying_signals.",
            "CONTACT CLAIM KEYS: contact evidence may use only identity, company_relationship, current_employment, role, seniority, authority, work_location, linkedin or email. Return contacts only when current public evidence exists.",
            "ROUTE CLAIM KEYS: route evidence may use only target_company, route_identity, entry_point, decision_maker or route_path. Return a route only when there is a public, verifiable path such as a contact page, named role/profile, public email or official form.",
            "SOURCES: Prefer official sites, government/regulatory sources and official profiles. Give exact public URLs and traceable excerpts. Never invent an email, role, URL or company.",
            "BOUNDARY: Maximum three companies, two contacts per company and one route per company. Empty arrays are valid when evidence is unavailable.",
            "Write concise British English and return exact JSON only. Prompt policy: genesis-g82-expansion/v1.",
          ].join(" "),
          input:JSON.stringify({industryKey:input.industryKey,industryName:input.industryName,excludedDomains:input.excludedDomains.slice(0,250)}),
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
      const transport=classifyOpenAITransportError(error,"GENESIS_G8_REPAIR",timeoutMs);
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
      return gateway.value;
    }catch(error){
      await discardOpenAIBackgroundResponse({organisationId,campaignId:null,jobType:"GENESIS_G8_REPAIR",jobId:input.jobId,requestScope}).catch(()=>undefined);
      const safe=safeStructuredAiError(error); await completeAiRequest({ledgerId:reservation.ledgerId,ok:false,usage:responseUsage(json),webSearchCalls:1,durationMs:Date.now()-startedAt,responseId,errorCode:safe.code,errorMessage:safe.message}).catch(()=>undefined); throw new Error(`GENESIS_G82_EXPANSION_RESPONSE_${safe.code}`);
    }
  }
  throw lastTerminalError??new Error("GENESIS_G82_EXPANSION_TERMINAL_RETRY_LIMIT");
}

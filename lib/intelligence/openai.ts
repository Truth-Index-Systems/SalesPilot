import { z } from "zod";
import { discardOpenAIBackgroundResponse, fetchResumableOpenAIResponse, isOpenAIBackgroundPending } from "@/lib/ai/background-response";
import { type AiEnvelope } from "@/lib/ai/contracts";
import { type BusinessDnaPayload } from "@/lib/ai/schemas/business-dna";
import type { WebsiteSource } from "@/lib/intelligence/website-reader";
import { resolveOpenAIModel } from "@/lib/intelligence/model-router";
import { completeAiRequest, reserveAiRequest, responseUsage } from "@/lib/ai/governance";
import { stableFingerprint } from "@/lib/ai/cost-optimisation";
import { StructuredAiOutputError, parseStructuredAiResponse, safeStructuredAiError } from "@/lib/ai/structured-response-gateway";
import { aiRequestTimeoutMs, classifyOpenAITransportError } from "@/lib/ai/request-policy";
import { aiWorkloadProfile, aiPromptCacheKey } from "@/lib/ai/workload-profile";
import {
  CoreBusinessDnaEnvelopeSchema,
  GrowthStrategyEnvelopeSchema,
  coreBusinessDnaJsonSchema,
  growthStrategyJsonSchema,
  assembleBusinessAnalysis,
  type CoreBusinessDnaEnvelope,
  type GrowthStrategyEnvelope,
} from "@/lib/intelligence/business-analysis-decomposition";

function getConfig() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
  const resolved = resolveOpenAIModel("strategy");
  return { apiKey, model: resolved.model };
}

const GatewaySchema = z.record(z.unknown());

type CommonParams = { organisationId:string|null; publicAnalysis?:boolean; jobId:string; website:string };

function evidenceSafe(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const row = item && typeof item === "object" && !Array.isArray(item) ? item as Record<string, unknown> : {};
    const sourceType = ["website","document","provider","user","system"].includes(String(row.sourceType)) ? String(row.sourceType) : "website";
    const url = typeof row.url === "string" && /^https?:\/\//i.test(row.url) ? row.url : null;
    const observed = typeof row.observedAt === "string" && !Number.isNaN(new Date(row.observedAt).getTime()) ? new Date(row.observedAt).toISOString() : new Date().toISOString();
    const freshness = ["current","recent","stale","unknown"].includes(String(row.freshness)) ? String(row.freshness) : "unknown";
    return { sourceType, sourceId:String(row.sourceId || `source-${index+1}`), url, excerpt:typeof row.excerpt === "string" ? row.excerpt.slice(0,800) : null, observedAt:observed, freshness };
  });
}

function canonicalCore(raw: Record<string, unknown>, context:{website:string;model:string;generatedAt:string}): CoreBusinessDnaEnvelope {
  const payload = raw.payload && typeof raw.payload === "object" && !Array.isArray(raw.payload) ? {...raw.payload as Record<string,unknown>} : {};
  const company = payload.company && typeof payload.company === "object" && !Array.isArray(payload.company) ? {...payload.company as Record<string,unknown>, website:context.website} : {website:context.website};
  payload.company = company;
  return CoreBusinessDnaEnvelopeSchema.parse({
    ...raw,
    schemaVersion:"business-dna-core/v1",
    promptVersion:"business-discovery-core/v1-decomposed",
    model:context.model,
    generatedAt:context.generatedAt,
    evidence:evidenceSafe(raw.evidence),
    payload,
  });
}

function canonicalGrowth(raw: Record<string, unknown>, context:{model:string;generatedAt:string}): GrowthStrategyEnvelope {
  return GrowthStrategyEnvelopeSchema.parse({
    ...raw,
    schemaVersion:"business-growth/v1",
    promptVersion:"business-discovery-growth/v1-decomposed",
    model:context.model,
    generatedAt:context.generatedAt,
    evidence:evidenceSafe(raw.evidence),
  });
}

async function runPhase<T>(params: CommonParams & {
  phase:"core"|"growth";
  instructions:string;
  input:string;
  jsonSchema:unknown;
  schemaName:string;
  maxOutputTokens:number;
  reasoningEffort:"low"|"medium"|"high";
  estimatedCostUsd:number;
  fingerprintData:unknown;
  canonicalise:(raw:Record<string,unknown>,context:{model:string;generatedAt:string})=>T;
}): Promise<T> {
  const {apiKey,model}=getConfig();
  const generatedAt=new Date().toISOString();
  const fingerprint=stableFingerprint({phase:params.phase,model,website:params.website,...(params.fingerprintData as Record<string,unknown>)});
  const requestScope=`business-analysis:${params.phase}:${fingerprint}`;
  const reservation=await reserveAiRequest({
    organisationId:params.organisationId,jobType:"BUSINESS_ANALYSIS",jobId:params.jobId,requestScope,model,
    estimatedCostUsd:params.estimatedCostUsd,publicAnalysis: params.publicAnalysis === true,
  });
  const requestInput = `CANONICAL WEBSITE: ${params.website}\nMODEL LABEL: ${model}\nGENERATED AT: ${generatedAt}\nPHASE: ${params.phase.toUpperCase()}\n\n${params.input}`;
  const body={
    model,
    instructions:params.instructions,
    input: requestInput,
    reasoning:{effort:params.reasoningEffort},
    text:{format:{type:"json_schema",name:params.schemaName,description:params.phase==="core"?"Fast evidence-backed Core Business DNA.":"Growth strategy and campaign recommendations derived from persisted Core Business DNA.",strict:true,schema:params.jsonSchema}},
    max_output_tokens:params.maxOutputTokens,
    store:false,
  };
  const startedAt=Date.now();
  let lastError:Error|null=null;
  for(let attempt=1;attempt<=2;attempt+=1){
    try{
      const response=await fetchResumableOpenAIResponse({apiKey,task:"BUSINESS_ANALYSIS",organisationId:params.organisationId,jobType:"BUSINESS_ANALYSIS",jobId:params.jobId,requestScope,model,ledgerId:reservation.ledgerId},{
        method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${apiKey}`},body:JSON.stringify(body),cache:"no-store",signal:AbortSignal.timeout(aiRequestTimeoutMs("BUSINESS_ANALYSIS")),
      });
      const json=await response.json().catch(()=>null);
      if(!response.ok){
        const message=json&&typeof json==="object"&&"error" in json?JSON.stringify((json as {error:unknown}).error):`HTTP ${response.status}`;
        throw new Error(`OpenAI request failed: ${message}`);
      }
      const parsed=await parseStructuredAiResponse({response:json,schema:GatewaySchema,jsonSchema:params.jsonSchema,schemaName:params.schemaName,apiKey,model});
      const result=params.canonicalise(parsed.value as Record<string,unknown>,{model,generatedAt});
      await completeAiRequest({ledgerId:reservation.ledgerId,ok:true,usage:responseUsage(json),durationMs:Date.now()-startedAt,responseId:typeof (json as any)?.id==="string"?(json as any).id:null});
      return result;
    }catch(error){
      if(isOpenAIBackgroundPending(error))throw error;
      if(error instanceof StructuredAiOutputError){
        await discardOpenAIBackgroundResponse({organisationId:params.organisationId,jobType:"BUSINESS_ANALYSIS",jobId:params.jobId,requestScope}).catch(()=>undefined);
        const safe=safeStructuredAiError(error);lastError=new Error(`STRUCTURED_AI_OUTPUT_${safe.code}:${safe.message}`);
      }else{
        lastError=classifyOpenAITransportError(error,"BUSINESS_ANALYSIS",aiRequestTimeoutMs("BUSINESS_ANALYSIS")).error;
      }
    }
  }
  await completeAiRequest({ledgerId:reservation.ledgerId,ok:false,durationMs:Date.now()-startedAt,errorCode:`BUSINESS_ANALYSIS_${params.phase.toUpperCase()}_FAILED`,errorMessage:lastError?.message??"Business analysis phase failed"}).catch(()=>undefined);
  throw lastError??new Error("Business analysis phase failed.");
}

export async function analyseBusinessCore(params: CommonParams & {sources:WebsiteSource[]}):Promise<CoreBusinessDnaEnvelope>{
  const profile=aiWorkloadProfile("BUSINESS_ANALYSIS");
  const compact=params.sources.slice(0,Math.min(profile.evidenceLimit,6)).map(source=>({...source,text:source.text.slice(0, 4500)}));
  const sourceBlock=compact.map((source,index)=>`SOURCE ${index+1}\nURL: ${source.url}\nTITLE: ${source.title}\nCONTENT: ${source.text}`).join("\n\n");
  const instructions=`ROLE: MarketRoute Business Understanding executive.\n\nMISSION: Produce a fast, evidence-backed Core Business DNA from first-party website evidence only. This is phase one of a decomposed workflow. Focus exclusively on what the company sells, how it creates value, proof, positioning and factual unknowns. Do NOT design campaigns, ICPs, buyer roles or outreach yet.\n\nTRUTH: KNOWN must be directly supported. INFERRED must remain cautious. UNKNOWN must stay unknown. Never invent customers, results, technologies, budgets or buying processes.\n\nOUTPUT: Exact JSON schema only. Keep summaries concise and commercially useful. British English. Set metadata exactly from request input. Evidence excerpts must come from supplied sources.`;
  return runPhase({...params,phase:"core",instructions,input:sourceBlock,jsonSchema:coreBusinessDnaJsonSchema,schemaName:"marketroute_business_dna_core",maxOutputTokens:Math.min(profile.maxOutputTokens,3200),reasoningEffort:"low",estimatedCostUsd:Number(process.env.MARKETROUTE_BUSINESS_ANALYSIS_CORE_ESTIMATED_COST_USD??"0.04"),fingerprintData:{prompt:"business-discovery-core/v1",cacheKey:`${aiPromptCacheKey("BUSINESS_ANALYSIS")}:core`,sources:compact},canonicalise:(raw,ctx)=>canonicalCore(raw,{...ctx,website:params.website})});
}

export async function analyseBusinessGrowth(params: CommonParams & {core:CoreBusinessDnaEnvelope}):Promise<GrowthStrategyEnvelope>{
  const profile=aiWorkloadProfile("BUSINESS_ANALYSIS");
  const coreInput=JSON.stringify({company:params.core.payload.company,offers:params.core.payload.offers,positioningCore:params.core.payload.positioningCore,evidenceNotes:params.core.payload.evidenceNotes,unknowns:params.core.payload.unknowns});
  const instructions=`ROLE: MarketRoute Growth Strategy executive.\n\nMISSION: Convert the persisted Core Business DNA into focused go-to-market recommendations for a startup/founder. Define evidence-grounded ICPs, buyer functions, pains, objections and no more than five campaign theses. Do not re-analyse or rewrite the seller's core facts.\n\nDECISION STANDARD: Would scarce founder selling time be deliberately allocated to this segment? Campaign fitScore is 0-100; confidence is 0-1. Challenge each campaign with the strongest risk.\n\nBOUNDARY: Recommend segments and campaigns only. Company Discovery chooses real accounts; Route Intelligence chooses account-specific entry routes; later stages own account-specific reasoning and outreach. Never invent specific companies, contacts, budgets, technologies or trigger events.\n\nOUTPUT: Exact JSON schema only. Concise British English. Set metadata exactly from request input.`;
  return runPhase({...params,phase:"growth",instructions,input:`PERSISTED CORE BUSINESS DNA:\n${coreInput}`,jsonSchema:growthStrategyJsonSchema,schemaName:"marketroute_growth_strategy",maxOutputTokens:Math.min(profile.maxOutputTokens,3800),reasoningEffort:"medium",estimatedCostUsd:Number(process.env.MARKETROUTE_BUSINESS_ANALYSIS_GROWTH_ESTIMATED_COST_USD??"0.06"),fingerprintData:{prompt:"business-discovery-growth/v1",cacheKey:`${aiPromptCacheKey("BUSINESS_ANALYSIS")}:growth`,core:params.core.payload},canonicalise:canonicalGrowth});
}

/** Compatibility wrapper for non-job callers. The persisted worker uses the two
 * phase functions directly so Core DNA survives a Growth retry. */
export async function analyseBusiness(params: CommonParams & {sources:WebsiteSource[]}):Promise<AiEnvelope<BusinessDnaPayload>>{
  const core=await analyseBusinessCore(params);
  const growth=await analyseBusinessGrowth({...params,core});
  return assembleBusinessAnalysis(core,growth);
}

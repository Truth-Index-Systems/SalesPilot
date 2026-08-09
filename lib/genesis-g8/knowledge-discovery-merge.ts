import "server-only";

import { databaseRequest } from "@/lib/database/postgrest";
import type { OrganisationContext } from "@/lib/auth/organisation-context";
import { decideGenesisG8Activation, readGenesisG8ActivationRuntime, recordGenesisG8ActivationEvent } from "./activation-controller";

export const GENESIS_G8_KNOWLEDGE_DISCOVERY_MERGE_VERSION = "G8.1-R20-ADAPTIVE-KNOWLEDGE-DISCOVERY-MERGE-1.0" as const;

export type GenesisG8LaunchKnowledgeCandidate = {
  entityId: string; canonicalKey: string; businessFit: number; retrievalScore: number;
  truthIndex: number; confidence: number; coverage: number; routeReadiness: number;
  mayUseKnowledgeImmediately: boolean; blocking: boolean; nextAction: string;
};

export type GenesisG8LaunchKnowledgeMatch = {
  version: string; matchedAt: string; candidates: GenesisG8LaunchKnowledgeCandidate[];
};

export function isGenesisG8KnowledgeDiscoveryMergeEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.GENESIS_G8_KNOWLEDGE_DISCOVERY_MERGE !== "false";
}

export function sanitiseGenesisG8LaunchKnowledgeMatch(value: unknown): GenesisG8LaunchKnowledgeMatch | null {
  if (!value || typeof value !== "object") return null;
  const raw=value as any;
  if (!Array.isArray(raw.candidates)) return null;
  const candidates=raw.candidates.slice(0,25).map((item:any)=>({
    entityId:String(item?.entityId??""), canonicalKey:String(item?.canonicalKey??""),
    businessFit:Number(item?.businessFit??0), retrievalScore:Number(item?.retrievalScore??0),
    truthIndex:Number(item?.truthIndex??0), confidence:Number(item?.confidence??0), coverage:Number(item?.coverage??0),
    routeReadiness:Number(item?.routeReadiness??0), mayUseKnowledgeImmediately:item?.mayUseKnowledgeImmediately===true,
    blocking:item?.blocking===true, nextAction:String(item?.nextAction??"")
  })).filter((item:any)=>/^[0-9a-f-]{36}$/i.test(item.entityId)&&item.canonicalKey&&item.mayUseKnowledgeImmediately&&!item.blocking);
  if (!candidates.length) return null;
  return { version:String(raw.version??"unknown").slice(0,120), matchedAt:String(raw.matchedAt??new Date().toISOString()), candidates };
}

export async function mergeGenesisG8KnowledgeIntoCampaign(params:{
  campaignId:string; context:OrganisationContext; knowledgeMatch:GenesisG8LaunchKnowledgeMatch|null;
}) {
  if (!isGenesisG8KnowledgeDiscoveryMergeEnabled() || !params.knowledgeMatch?.candidates.length) return { seeded:0, skipped:true, activation:null };
  const started=Date.now();
  const runtime=await readGenesisG8ActivationRuntime();
  const strongest=params.knowledgeMatch.candidates[0];
  const activation=decideGenesisG8Activation({
    campaignId:params.campaignId,organisationId:params.context.organisationId,runtime,
    candidateTruth:strongest?.truthIndex,candidateConfidence:strongest?.confidence,candidateCoverage:strongest?.coverage,candidateBlocking:strongest?.blocking
  });
  if(!activation.activated){
    await recordGenesisG8ActivationEvent({organisationId:params.context.organisationId,campaignId:params.campaignId,configuredLevel:activation.configuredLevel,effectiveLevel:activation.effectiveLevel,decision:"FALLBACK",reason:activation.reasons.join(" "),candidateCount:params.knowledgeMatch.candidates.length,seededCount:0,latencyMs:Date.now()-started,fallbackUsed:true,failed:false});
    return {seeded:0,skipped:true,activation};
  }
  // R20 trusts the existing R5/R13 eligibility decision as the primary authority.
  // The server-side merge RPC still re-verifies entity status and minimum safety floors.
  const eligible=params.knowledgeMatch.candidates.filter(c=>c.mayUseKnowledgeImmediately&&!c.blocking).slice(0,activation.candidateLimit);
  const payload=eligible.map(c=>({entityId:c.entityId,businessFit:c.businessFit,retrievalScore:c.retrievalScore}));
  if(!payload.length){
    await recordGenesisG8ActivationEvent({organisationId:params.context.organisationId,campaignId:params.campaignId,configuredLevel:activation.configuredLevel,effectiveLevel:activation.effectiveLevel,decision:"FALLBACK",reason:"No candidate survived the R20 adaptive-default eligibility gate.",candidateCount:params.knowledgeMatch.candidates.length,seededCount:0,latencyMs:Date.now()-started,fallbackUsed:true,failed:false});
    return {seeded:0,skipped:true,activation};
  }
  try {
    const rows=await databaseRequest<Array<{seeded_count:number}>>("rpc/merge_genesis_g8_knowledge_candidates_into_campaign",{
      method:"POST", body:JSON.stringify({
        p_organisation_id:params.context.organisationId, p_campaign_id:params.campaignId,
        p_merge_version:GENESIS_G8_KNOWLEDGE_DISCOVERY_MERGE_VERSION, p_candidates:payload
      })
    });
    const seeded=Number(rows?.[0]?.seeded_count??0);
    await recordGenesisG8ActivationEvent({organisationId:params.context.organisationId,campaignId:params.campaignId,configuredLevel:activation.configuredLevel,effectiveLevel:activation.effectiveLevel,decision:"ACTIVATED",reason:activation.reasons.join(" "),candidateCount:payload.length,seededCount:seeded,latencyMs:Date.now()-started,fallbackUsed:seeded===0,failed:false});
    return { seeded, skipped:false, activation };
  } catch (error) {
    // R19 remains fail-open. Discovery is the production safety path.
    console.warn("Genesis G8 adaptive default failed open to Discovery", error);
    await recordGenesisG8ActivationEvent({organisationId:params.context.organisationId,campaignId:params.campaignId,configuredLevel:activation.configuredLevel,effectiveLevel:activation.effectiveLevel,decision:"FAILED_OPEN",reason:error instanceof Error?error.message:"UNKNOWN",candidateCount:payload.length,seededCount:0,latencyMs:Date.now()-started,fallbackUsed:true,failed:true});
    return { seeded:0, skipped:true, activation };
  }
}

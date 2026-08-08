import "server-only";

import { databaseRequest } from "@/lib/database/postgrest";
import type { OrganisationContext } from "@/lib/auth/organisation-context";

export const GENESIS_G8_KNOWLEDGE_DISCOVERY_MERGE_VERSION = "G8.1-R15-KNOWLEDGE-DISCOVERY-MERGE-1.0" as const;

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
  if (!isGenesisG8KnowledgeDiscoveryMergeEnabled() || !params.knowledgeMatch?.candidates.length) return { seeded:0, skipped:true };
  const payload=params.knowledgeMatch.candidates.map(c=>({entityId:c.entityId,businessFit:c.businessFit,retrievalScore:c.retrievalScore}));
  try {
    const rows=await databaseRequest<Array<{seeded_count:number}>>("rpc/merge_genesis_g8_knowledge_candidates_into_campaign",{
      method:"POST", body:JSON.stringify({
        p_organisation_id:params.context.organisationId, p_campaign_id:params.campaignId,
        p_merge_version:GENESIS_G8_KNOWLEDGE_DISCOVERY_MERGE_VERSION, p_candidates:payload
      })
    });
    return { seeded:Number(rows?.[0]?.seeded_count??0), skipped:false };
  } catch (error) {
    // R15 is an acceleration layer. Campaign launch must remain fail-open.
    console.warn("Genesis G8 knowledge merge failed open", error);
    return { seeded:0, skipped:true };
  }
}

import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";
import { decideGenesisG8Capacity, readGenesisG8CapacitySnapshot, type GenesisG8CapacityDecision } from "./capacity-budget";

export const GENESIS_G8_FOUNDER_COMMAND_CENTRE_VERSION = "G8.1-R18-FOUNDER-COMMAND-CENTRE-1.0" as const;

type RawSnapshot = {
  overall?: Record<string, unknown>;
  entityTypes?: unknown[];
  evidence?: Record<string, unknown>;
  retrieval?: Record<string, unknown>;
  reuse?: Record<string, unknown>;
  repairs?: Record<string, unknown>;
  refresh?: Record<string, unknown>;
  reviews?: Record<string, unknown>;
  industries?: unknown[];
  attention?: unknown[];
  latestCapacity?: Record<string, unknown> | null;
};

const n=(value:unknown)=>Number.isFinite(Number(value))?Number(value):0;
const s=(value:unknown)=>typeof value==="string"?value:"";
const b=(value:unknown)=>value===true;

export type FounderEntityHealth={entityType:string;count:number;truthIndex:number;confidence:number;coverage:number;reviewRequired:number};
export type FounderIndustryHealth={id:string;name:string;canonicalKey:string;truthIndex:number;confidence:number;coverage:number;reviewRequired:boolean};
export type FounderAttentionItem={entityId:string;kind:string;label:string;truthIndex:number;priority:number;detail:string};

export interface GenesisG8FounderCommandCentre {
  version: typeof GENESIS_G8_FOUNDER_COMMAND_CENTRE_VERSION;
  overall:{activeEntities:number;suppressedEntities:number;averageTruthIndex:number;averageConfidence:number;averageCoverage:number;reviewRequired:number};
  entityTypes:FounderEntityHealth[];
  evidence:{totalEvidence:number;knowledgeEvidence:number;discoveryEvidence:number;evidenceAddedPeriod:number;knowledgePercent:number;discoveryPercent:number};
  retrieval:{retrievals:number;inspected:number;matched:number;ready:number;readyWithGaps:number;refreshRequired:number;humanReviewRequired:number;discoveryRequired:number;averageLatencyMs:number;instantUsable:number;knowledgeHitRate:number};
  reuse:{links:number;campaigns:number;entities:number};
  repairs:{queued:number;active:number;completed:number;failed:number;blocking:number;customerPending:number;backgroundPending:number};
  refresh:{consideredPeriod:number;queuedPeriod:number;averagePriority:number};
  reviews:{openReviews:number};
  industries:FounderIndustryHealth[];
  attention:FounderAttentionItem[];
  capacity:GenesisG8CapacityDecision;
}

function object(value:unknown):Record<string,unknown>{return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};}
function array(value:unknown):unknown[]{return Array.isArray(value)?value:[];}

export async function getGenesisG8FounderCommandCentre(rangeDays=7):Promise<GenesisG8FounderCommandCentre>{
  const since=new Date(Date.now()-Math.max(1,rangeDays)*86400000).toISOString();
  const [raw,capacitySnapshot]=await Promise.all([
    databaseRequest<RawSnapshot>("rpc/genesis_g8_founder_intelligence_snapshot",{method:"POST",body:JSON.stringify({p_since:since})}),
    readGenesisG8CapacitySnapshot(),
  ]);
  const snapshot=object(raw);
  const overall=object(snapshot.overall);
  const evidence=object(snapshot.evidence);
  const retrieval=object(snapshot.retrieval);
  const reuse=object(snapshot.reuse);
  const repairs=object(snapshot.repairs);
  const refresh=object(snapshot.refresh);
  const reviews=object(snapshot.reviews);
  const totalEvidence=n(evidence.total_evidence);
  const knowledgeEvidence=n(evidence.knowledge_evidence);
  const discoveryEvidence=n(evidence.discovery_evidence);
  const inspected=n(retrieval.inspected);
  const matched=n(retrieval.matched);
  const instantUsable=n(retrieval.ready)+n(retrieval.ready_with_gaps);
  return {
    version:GENESIS_G8_FOUNDER_COMMAND_CENTRE_VERSION,
    overall:{activeEntities:n(overall.activeEntities),suppressedEntities:n(overall.suppressedEntities),averageTruthIndex:n(overall.averageTruthIndex),averageConfidence:n(overall.averageConfidence),averageCoverage:n(overall.averageCoverage),reviewRequired:n(overall.reviewRequired)},
    entityTypes:array(snapshot.entityTypes).map(row=>{const x=object(row);return {entityType:s(x.entityType),count:n(x.count),truthIndex:n(x.truthIndex),confidence:n(x.confidence),coverage:n(x.coverage),reviewRequired:n(x.reviewRequired)};}),
    evidence:{totalEvidence,knowledgeEvidence,discoveryEvidence,evidenceAddedPeriod:n(evidence.evidence_added_period),knowledgePercent:totalEvidence?knowledgeEvidence/totalEvidence*100:0,discoveryPercent:totalEvidence?discoveryEvidence/totalEvidence*100:0},
    retrieval:{retrievals:n(retrieval.retrievals),inspected,matched,ready:n(retrieval.ready),readyWithGaps:n(retrieval.ready_with_gaps),refreshRequired:n(retrieval.refresh_required),humanReviewRequired:n(retrieval.human_review_required),discoveryRequired:n(retrieval.discovery_required),averageLatencyMs:n(retrieval.avg_latency_ms),instantUsable,knowledgeHitRate:matched?instantUsable/matched*100:0},
    reuse:{links:n(reuse.links),campaigns:n(reuse.campaigns),entities:n(reuse.entities)},
    repairs:{queued:n(repairs.queued),active:n(repairs.active),completed:n(repairs.completed),failed:n(repairs.failed),blocking:n(repairs.blocking),customerPending:n(repairs.customer_pending),backgroundPending:n(repairs.background_pending)},
    refresh:{consideredPeriod:n(refresh.considered_period),queuedPeriod:n(refresh.queued_period),averagePriority:n(refresh.avg_priority)},
    reviews:{openReviews:n(reviews.open_reviews)},
    industries:array(snapshot.industries).map(row=>{const x=object(row);return {id:s(x.id),name:s(x.name),canonicalKey:s(x.canonicalKey),truthIndex:n(x.truthIndex),confidence:n(x.confidence),coverage:n(x.coverage),reviewRequired:b(x.reviewRequired)};}),
    attention:array(snapshot.attention).map(row=>{const x=object(row);return {entityId:s(x.entityId),kind:s(x.kind),label:s(x.label),truthIndex:n(x.truthIndex),priority:n(x.priority),detail:s(x.detail)};}),
    capacity:decideGenesisG8Capacity(capacitySnapshot),
  };
}

import "server-only";

import { databaseRequest } from "@/lib/database/postgrest";
import { calculateAndPersistMrTi2Truth } from "./production-hydration";
import { getMrTi2ClaimDefinition } from "./contracts";
import { persistMrTi2EvidenceAssessment } from "./ai/sidecar-repository";
import type { EvidenceSourceClass, TruthEntityType } from "../truth";

type EntityRow={id:string;entity_type:TruthEntityType;status:string};
type SnapshotRow={entity_id:string;calculated_at:string};
type ClaimRow={id:string;claim_key:string};
type EvidenceRow={
  id:string;claim_id:string;direction:"SUPPORTS"|"CONTRADICTS";source_class:EvidenceSourceClass;
  source_uri:string|null;source_ref:string|null;source_family:string|null;excerpt:string|null;
  strength:number;traceability:number;independence:number;observed_at:string;created_at:string;
};
type AssessmentRow={evidence_id:string};

const clamp01=(value:number)=>Math.max(0,Math.min(1,Number.isFinite(value)?value:0));
const authorityForSourceClass=(source:EvidenceSourceClass)=>{
  switch(source){
    case "REGULATORY_OR_GOVERNMENT": return 0.98;
    case "OFFICIAL_PRIMARY": return 0.95;
    case "OFFICIAL_PROFILE": return 0.90;
    case "MAJOR_REPUTABLE_MEDIA": return 0.85;
    case "INDUSTRY_PUBLICATION": return 0.78;
    case "COMMERCIAL_DATABASE": return 0.70;
    case "BUSINESS_DIRECTORY": return 0.58;
    case "SOCIAL_OR_COMMUNITY": return 0.45;
    case "SEARCH_SNIPPET": return 0.35;
    default: return 0.30;
  }
};

async function backfillMissingAssessments(entityId:string,entityType:TruthEntityType):Promise<number>{
  const claims=await databaseRequest<ClaimRow[]>(`genesis_g8_intelligence_claims?select=id,claim_key&entity_id=eq.${encodeURIComponent(entityId)}&limit=500`);
  if(!claims.length) return 0;
  const claimById=new Map(claims.map(row=>[row.id,row.claim_key]));
  const claimIds=claims.map(row=>row.id);
  const evidence=await databaseRequest<EvidenceRow[]>(`genesis_g8_intelligence_evidence?select=id,claim_id,direction,source_class,source_uri,source_ref,source_family,excerpt,strength,traceability,independence,observed_at,created_at&claim_id=in.(${claimIds.join(",")})&order=created_at.asc&limit=5000`);
  if(!evidence.length) return 0;
  const evidenceIds=evidence.map(row=>row.id);
  const assessments=await databaseRequest<AssessmentRow[]>(`genesis_g8_truth_v2_evidence_assessments?select=evidence_id&evidence_id=in.(${evidenceIds.join(",")})&limit=5000`).catch(()=>[]);
  const assessed=new Set(assessments.map(row=>row.evidence_id));
  const familyDepth=new Map<string,number>();
  let inserted=0;
  for(const item of evidence){
    const family=item.source_family?.trim()||item.source_uri?.trim()||item.id;
    const seen=familyDepth.get(family)??0;
    familyDepth.set(family,seen+1);
    if(assessed.has(item.id)) continue;
    const claimKey=claimById.get(item.claim_id);
    if(!claimKey) continue;
    const definition=getMrTi2ClaimDefinition(entityType,claimKey);
    if(!definition) continue;
    await persistMrTi2EvidenceAssessment({
      evidenceId:item.id,
      observation:{
        claimKey,
        direction:item.direction==="CONTRADICTS"?"CONTRADICT":"SUPPORT",
        proposition:definition.proposition,
        evidenceText:item.excerpt??item.source_ref??item.source_uri??"Persisted Genesis evidence",
        sourceUrl:item.source_uri??`urn:genesis-g8:evidence:${item.id}`,
        sourceTitle:item.source_ref,
        sourceClass:item.source_class,
        authority:authorityForSourceClass(item.source_class),
        directness:clamp01(Number(item.strength)),
        traceability:clamp01(Number(item.traceability)),
        sourcePublishedAt:null,
        observedAt:item.observed_at,
        sourceLineageKey:family,
        derivativeOfLineageKey:seen>0?family:null,
        derivativeDepth:seen,
        relationshipHints:[],
      },
    });
    inserted++;
  }
  return inserted;
}

export interface MrTi2ReconciliationResult{
  inspected:number;
  reconciled:number;
  assessmentsBackfilled:number;
  entityIds:string[];
}

export async function reconcileMissingMrTi2Snapshots(limit=8):Promise<MrTi2ReconciliationResult>{
  const bounded=Math.max(1,Math.min(25,Math.trunc(limit)));
  const entities=await databaseRequest<EntityRow[]>(`genesis_g8_intelligence_entities?select=id,entity_type,status&status=eq.ACTIVE&order=updated_at.desc&limit=100`);
  if(!entities.length) return {inspected:0,reconciled:0,assessmentsBackfilled:0,entityIds:[]};
  const snapshots=await databaseRequest<SnapshotRow[]>(`genesis_g8_truth_v2_snapshots?select=entity_id,calculated_at&order=calculated_at.desc&limit=1000`).catch(()=>[]);
  const snapshotted=new Set(snapshots.map(row=>row.entity_id));
  const missing=entities.filter(row=>!snapshotted.has(row.id)).slice(0,bounded);
  let assessmentsBackfilled=0;
  const entityIds:string[]=[];
  for(const entity of missing){
    assessmentsBackfilled+=await backfillMissingAssessments(entity.id,entity.entity_type);
    const result=await calculateAndPersistMrTi2Truth(entity.id);
    if(result) entityIds.push(entity.id);
  }
  return {inspected:entities.length,reconciled:entityIds.length,assessmentsBackfilled,entityIds};
}

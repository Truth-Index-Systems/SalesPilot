import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";
import type { MrTi2EntityTruthResult } from "./entity";
import { explainMrTi2Truth } from "./explainability";

type SnapshotRow={entity_id:string;truth_index:number;represented_confidence:number;coverage:number;foundational_integrity:number;review_state:string;result_json:MrTi2EntityTruthResult;calculated_at:string};
type EntityRow={id:string;display_name:string|null;canonical_key:string;entity_type:string};
export interface MrTi2FounderPreviewItem {entityId:string;displayName:string;entityType:string;truthIndex:number;coverage:number;confidence:number;foundationalIntegrity:number;reviewState:string;headline:string;nextAction:string|null;}
export interface MrTi2FounderPreview {engineVersion:"MR-TI-2.0";entities:number;averageTruthIndex:number;averageCoverage:number;averageConfidence:number;humanReviewRequired:number;verifyRequired:number;items:MrTi2FounderPreviewItem[];}

const avg=(values:number[])=>values.length?values.reduce((a,b)=>a+b,0)/values.length:0;

export async function readMrTi2FounderPreview(limit=24):Promise<MrTi2FounderPreview>{
  const snapshots=await databaseRequest<SnapshotRow[]>(`genesis_g8_truth_v2_snapshots?select=entity_id,truth_index,represented_confidence,coverage,foundational_integrity,review_state,result_json,calculated_at&order=calculated_at.desc&limit=${Math.max(20,Math.min(500,limit*8))}`).catch(()=>[]);
  const latest=new Map<string,SnapshotRow>(); for(const row of snapshots){if(!latest.has(row.entity_id)) latest.set(row.entity_id,row);}
  const ids=[...latest.keys()];
  const entities=ids.length?await databaseRequest<EntityRow[]>(`genesis_g8_intelligence_entities?select=id,display_name,canonical_key,entity_type&id=in.(${ids.join(",")})`).catch(()=>[]):[];
  const entityMap=new Map(entities.map((row)=>[row.id,row]));
  const items=[...latest.values()].map((row)=>{
    const entity=entityMap.get(row.entity_id); const explanation=explainMrTi2Truth(row.result_json);
    return {entityId:row.entity_id,displayName:entity?.display_name??entity?.canonical_key??row.entity_id,entityType:entity?.entity_type??row.result_json.entityType,truthIndex:Number(row.truth_index),coverage:Number(row.coverage),confidence:Number(row.represented_confidence),foundationalIntegrity:Number(row.foundational_integrity),reviewState:row.review_state,headline:explanation.summary,nextAction:explanation.nextAction?`${explanation.nextAction.claimKey}: ${explanation.nextAction.action}`:null};
  }).sort((a,b)=>{
    const rank=(state:string)=>state==="HUMAN_REVIEW_REQUIRED"?2:state==="VERIFY"?1:0;
    return rank(b.reviewState)-rank(a.reviewState)||a.truthIndex-b.truthIndex;
  }).slice(0,limit);
  return {engineVersion:"MR-TI-2.0",entities:latest.size,averageTruthIndex:avg([...latest.values()].map(r=>Number(r.truth_index))),averageCoverage:avg([...latest.values()].map(r=>Number(r.coverage))),averageConfidence:avg([...latest.values()].map(r=>Number(r.represented_confidence))),humanReviewRequired:[...latest.values()].filter(r=>r.review_state==="HUMAN_REVIEW_REQUIRED").length,verifyRequired:[...latest.values()].filter(r=>r.review_state==="VERIFY").length,items};
}

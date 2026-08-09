import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";
import { getMrTi2ClaimContract } from "./contracts";
import { buildMrTi2MatrixOne, aggregateMrTi2ClaimEvidence, type MrTi2MatrixOneEvidenceInput } from "./matrix-one";
import { evaluateMrTi2RawClaim, type MrTi2RawClaimState } from "./claims";
import { evaluateMrTi2MatrixTwo, type MrTi2ClaimRelationshipInput } from "./matrix-two";
import { aggregateMrTi2EntityTruth, buildMrTi2SnapshotWrite, type MrTi2EntityTruthResult } from "./entity";
import { persistMrTi2TruthSnapshot } from "./snapshot-repository";
import { syncMrTi2ClaimProfiles } from "./profile-sync";
import type { TruthEntityType } from "../truth/types";

type ClaimRow={id:string;claim_key:string};
type EvidenceRow={id:string;claim_id:string;direction:"SUPPORTS"|"CONTRADICTS";observed_at:string};
type AssessmentRow={evidence_id:string;authority:number;directness:number;traceability:number;source_published_at:string|null;derivative_depth:number};
type RelationshipRow={from_claim_id:string;to_claim_id:string;relationship_type:"DEPENDS_ON"|"CONTRADICTS";strength:number};
type EntityRow={id:string;entity_type:TruthEntityType};

export async function calculateAndPersistMrTi2Truth(entityId:string):Promise<MrTi2EntityTruthResult|null>{
  await syncMrTi2ClaimProfiles(entityId);
  const entityRows=await databaseRequest<EntityRow[]>(`genesis_g8_intelligence_entities?select=id,entity_type&id=eq.${encodeURIComponent(entityId)}&limit=1`);
  const entity=entityRows[0]; if(!entity) return null;
  const contract=getMrTi2ClaimContract(entity.entity_type);
  const claims=await databaseRequest<ClaimRow[]>(`genesis_g8_intelligence_claims?select=id,claim_key&entity_id=eq.${encodeURIComponent(entityId)}&limit=500`);
  const byId=new Map(claims.map((claim)=>[claim.id,claim.claim_key]));
  const byKey=new Map(claims.map((claim)=>[claim.claim_key,claim.id]));
  const claimIds=claims.map((claim)=>claim.id);
  const evidence=claimIds.length?await databaseRequest<EvidenceRow[]>(`genesis_g8_intelligence_evidence?select=id,claim_id,direction,observed_at&claim_id=in.(${claimIds.join(",")})&limit=5000`):[];
  const evidenceIds=evidence.map((item)=>item.id);
  const assessments=evidenceIds.length?await databaseRequest<AssessmentRow[]>(`genesis_g8_truth_v2_evidence_assessments?select=evidence_id,authority,directness,traceability,source_published_at,derivative_depth&evidence_id=in.(${evidenceIds.join(",")})&limit=5000`):[];
  const assessmentByEvidence=new Map(assessments.map((row)=>[row.evidence_id,row]));
  const definitionByKey=new Map(contract.claims.map((definition)=>[definition.key,definition]));
  const matrixInputs:MrTi2MatrixOneEvidenceInput[]=[];
  for(const item of evidence){
    const claimKey=byId.get(item.claim_id); const assessment=assessmentByEvidence.get(item.id); const definition=claimKey?definitionByKey.get(claimKey):null;
    if(!claimKey||!assessment||!definition) continue; // Legacy evidence without V2 primitives remains outside shadow maths until reassessed.
    matrixInputs.push({evidenceKey:item.id,claimKey,direction:item.direction==="SUPPORTS"?"SUPPORT":"CONTRADICT",primitive:{authority:Number(assessment.authority),directness:Number(assessment.directness),traceability:Number(assessment.traceability),sourcePublishedAt:assessment.source_published_at,observedAt:item.observed_at,freshnessHalfLifeDays:definition.freshnessHalfLifeDays,derivativeDepth:Number(assessment.derivative_depth)}});
  }
  const cells=buildMrTi2MatrixOne(matrixInputs);
  const rawClaims:Record<string,MrTi2RawClaimState>={};
  for(const definition of contract.claims) rawClaims[definition.key]=evaluateMrTi2RawClaim(aggregateMrTi2ClaimEvidence(definition.key,cells));
  const relationships=await databaseRequest<RelationshipRow[]>(`genesis_g8_truth_v2_claim_relationships?select=from_claim_id,to_claim_id,relationship_type,strength&entity_id=eq.${encodeURIComponent(entityId)}&limit=1000`).catch(()=>[]);
  const matrixTwoRelationships:MrTi2ClaimRelationshipInput[]=relationships.flatMap((row)=>{
    const fromClaimKey=byId.get(row.from_claim_id),toClaimKey=byId.get(row.to_claim_id); if(!fromClaimKey||!toClaimKey) return [];
    return [{fromClaimKey,toClaimKey,relationshipType:row.relationship_type,strength:Number(row.strength)}];
  });
  const adjusted=evaluateMrTi2MatrixTwo({claims:rawClaims,relationships:matrixTwoRelationships});
  const result=aggregateMrTi2EntityTruth({entityType:entity.entity_type,claims:adjusted.claims,definitions:contract.claims});
  await persistMrTi2TruthSnapshot(buildMrTi2SnapshotWrite(entityId,result));
  return result;
}

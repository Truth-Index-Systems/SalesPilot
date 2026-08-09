import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";
import type { MrTi2EvidenceObservation } from "./evidence-contract";

const esc=(value:string)=>encodeURIComponent(value);
type DbRow=Record<string,unknown>;
const s=(value:unknown)=>typeof value==="string"?value:String(value??"");

async function resolveDerivativeEvidenceId(lineageKey:string|null):Promise<string|null>{
  if(!lineageKey) return null;
  const rows=await databaseRequest<DbRow[]>(`genesis_g8_truth_v2_evidence_assessments?select=evidence_id&source_lineage_key=eq.${esc(lineageKey)}&order=created_at.asc&limit=1`).catch(()=>[]);
  return rows[0]?s(rows[0].evidence_id):null;
}

export async function persistMrTi2EvidenceAssessment(input:{evidenceId:string;observation:MrTi2EvidenceObservation}):Promise<void>{
  const derivativeEvidenceId=await resolveDerivativeEvidenceId(input.observation.derivativeOfLineageKey);
  await databaseRequest("genesis_g8_truth_v2_evidence_assessments",{
    method:"POST", headers:{Prefer:"resolution=merge-duplicates,return=minimal"},
    body:JSON.stringify({
      evidence_id:input.evidenceId, engine_version:"MR-TI-2.0",
      authority:input.observation.authority, directness:input.observation.directness, traceability:input.observation.traceability,
      source_published_at:input.observation.sourcePublishedAt,
      source_lineage_key:input.observation.sourceLineageKey,
      derivative_of_evidence_id:derivativeEvidenceId,
      derivative_depth:input.observation.derivativeDepth,
      ai_observation_json:input.observation,
      updated_at:new Date().toISOString(),
    }),
  });
}

export async function persistMrTi2RelationshipHints(input:{entityId:string;fromClaimId:string;claims:{id:string;claimKey:string}[];observation:MrTi2EvidenceObservation}):Promise<number>{
  const byKey=new Map(input.claims.map((claim)=>[claim.claimKey,claim.id]));
  let persisted=0;
  for(const hint of input.observation.relationshipHints){
    const targetClaimId=byKey.get(hint.targetClaimKey);
    if(!targetClaimId||targetClaimId===input.fromClaimId) continue;
    const pair=hint.type==="CONTRADICTS" && targetClaimId<input.fromClaimId
      ? {from:targetClaimId,to:input.fromClaimId}
      : {from:input.fromClaimId,to:targetClaimId};
    await databaseRequest("genesis_g8_truth_v2_claim_relationships?on_conflict=from_claim_id,to_claim_id,relationship_type",{
      method:"POST", headers:{Prefer:"resolution=merge-duplicates,return=minimal"},
      body:JSON.stringify({
        entity_id:input.entityId, from_claim_id:pair.from, to_claim_id:pair.to,
        relationship_type:hint.type, strength:hint.strength,
        provenance_json:{source:"MR_TI_2_AI_RELATIONSHIP_HINT",rationale:hint.rationale,sourceUrl:input.observation.sourceUrl,promptVersion:"mr-ti-2/claim-repair/1.0"},
        updated_at:new Date().toISOString(),
      }),
    });
    persisted+=1;
  }
  return persisted;
}

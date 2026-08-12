import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";
import type { MrTi2SnapshotWrite } from "./entity";

type DbRow=Record<string,unknown>;
export interface MrTi2PersistedSnapshot { id:string; entityId:string; calculatedAt:string; }
const s=(value:unknown)=>typeof value==="string"?value:String(value??"");

export async function persistMrTi2TruthSnapshot(snapshot:MrTi2SnapshotWrite):Promise<MrTi2PersistedSnapshot>{
  const rows=await databaseRequest<DbRow[]>("genesis_g8_truth_v2_snapshots",{
    method:"POST",
    headers:{Prefer:"return=representation"},
    body:JSON.stringify({
      entity_id:snapshot.entityId,
      engine_version:snapshot.engineVersion,
      contract_version:snapshot.contractVersion,
      truth_semantics_version:snapshot.truthSemanticsVersion,
      truth_index:snapshot.truthIndex,
      evidence_sufficiency:snapshot.evidenceSufficiency,
      represented_confidence:snapshot.representedConfidence,
      coverage:snapshot.coverage,
      foundational_integrity:snapshot.foundationalIntegrity,
      max_contradiction_severity:snapshot.maxContradictionSeverity,
      review_state:snapshot.reviewState,
      calibrated_probability_coverage:snapshot.calibratedProbabilityCoverage,
      probability_state:snapshot.probabilityState,
      result_json:snapshot.result,
      calculated_at:snapshot.calculatedAt,
    }),
  });
  if(!rows?.[0]) throw new Error("MR_TI_2_SNAPSHOT_INSERT_EMPTY");
  return {id:s(rows[0].id),entityId:s(rows[0].entity_id),calculatedAt:s(rows[0].calculated_at)};
}

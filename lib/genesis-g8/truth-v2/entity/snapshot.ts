import type { MrTi2EntityTruthResult, MrTi2SnapshotWrite } from "./types";

export function buildMrTi2SnapshotWrite(entityId:string,result:MrTi2EntityTruthResult):MrTi2SnapshotWrite{
  if(!entityId) throw new Error("MR_TI_2_SNAPSHOT_ENTITY_ID_REQUIRED");
  return {
    entityId,
    engineVersion:result.engineVersion,
    contractVersion:result.contractVersion,
    truthIndex:result.state.truthIndex,
    representedConfidence:result.state.representedConfidence,
    coverage:result.state.coverage,
    foundationalIntegrity:result.state.foundationalIntegrity,
    maxContradictionSeverity:result.state.maxContradictionSeverity,
    reviewState:result.state.reviewState,
    result,
    calculatedAt:result.calculatedAt,
  };
}

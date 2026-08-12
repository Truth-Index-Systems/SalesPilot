import type { MrTi2EntityTruthResult, MrTi2SnapshotWrite } from "./types";

export function buildMrTi2SnapshotWrite(entityId:string,result:MrTi2EntityTruthResult):MrTi2SnapshotWrite{
  if(!entityId) throw new Error("MR_TI_2_SNAPSHOT_ENTITY_ID_REQUIRED");
  return {
    entityId,
    engineVersion:result.engineVersion,
    contractVersion:result.contractVersion,
    truthSemanticsVersion:result.truthSemanticsVersion,
    truthIndex:result.state.truthIndex,
    evidenceSufficiency:result.state.evidenceSufficiency,
    representedConfidence:result.state.representedConfidence,
    coverage:result.state.coverage,
    foundationalIntegrity:result.state.foundationalIntegrity,
    maxContradictionSeverity:result.state.maxContradictionSeverity,
    reviewState:result.state.reviewState,
    calibratedProbabilityCoverage:result.state.calibratedProbabilityCoverage,
    probabilityState:result.state.probabilityState,
    result,
    calculatedAt:result.calculatedAt,
  };
}

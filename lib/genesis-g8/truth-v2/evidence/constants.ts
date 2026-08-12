export const MR_TI_2_EVIDENCE_STRENGTH_CAP = 0.999 as const;
export const MR_TI_2_EVIDENCE_SD_PENALTY = 0.5 as const;
export const MR_TI_2_LINEAGE_DECAY_BASE = 3 as const;

export const MR_TI_2_INTRINSIC_QUALITY_WEIGHTS = Object.freeze({
  authority: 1,
  directness: 1,
  traceability: 1,
} as const);

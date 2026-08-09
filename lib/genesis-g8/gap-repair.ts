import type { GenesisG8IntelligenceGap } from "./hydration";

export type GenesisG8GapRepairMode =
  | "DISCOVER_MISSING_CLAIM"
  | "ADD_CORROBORATING_EVIDENCE"
  | "REFRESH_STALE_EVIDENCE"
  | "RESOLVE_LOW_CONFIDENCE"
  | "RESOLVE_CONTRADICTION";

export type GenesisG8GapRepairDisposition =
  | "DISCOVERY_INTELLIGENCE"
  | "HUMAN_REVIEW";

export interface GenesisG8GapRepairContract {
  claimId: string;
  claimKey: string;
  label: string;
  impactClass: GenesisG8IntelligenceGap["impactClass"];
  reason: GenesisG8IntelligenceGap["reason"];
  mode: GenesisG8GapRepairMode;
  disposition: GenesisG8GapRepairDisposition;
  priority: number;
  currentConfidence: number;
  evidenceCount: number;
  minimumEvidence: number;
  additionalEvidenceNeeded: number;
  freshestEvidenceAt: string | null;
  objective: string;
}

const modeForGap = (gap: GenesisG8IntelligenceGap): GenesisG8GapRepairMode => {
  switch (gap.reason) {
    case "MISSING_EVIDENCE": return "DISCOVER_MISSING_CLAIM";
    case "INSUFFICIENT_EVIDENCE": return "ADD_CORROBORATING_EVIDENCE";
    case "STALE_EVIDENCE": return "REFRESH_STALE_EVIDENCE";
    case "CONTRADICTED": return "RESOLVE_CONTRADICTION";
    case "LOW_CONFIDENCE": return "RESOLVE_LOW_CONFIDENCE";
  }
};

const dispositionForGap = (gap: GenesisG8IntelligenceGap): GenesisG8GapRepairDisposition =>
  gap.reason === "CONTRADICTED" ? "HUMAN_REVIEW" : "DISCOVERY_INTELLIGENCE";

const objectiveForGap = (gap: GenesisG8IntelligenceGap, mode: GenesisG8GapRepairMode) => {
  switch (mode) {
    case "DISCOVER_MISSING_CLAIM": return `Find evidence establishing ${gap.label}.`;
    case "ADD_CORROBORATING_EVIDENCE": return `Find additional independent evidence for ${gap.label}.`;
    case "REFRESH_STALE_EVIDENCE": return `Find current evidence confirming or disproving ${gap.label}.`;
    case "RESOLVE_LOW_CONFIDENCE": return `Find stronger evidence to resolve low confidence in ${gap.label}.`;
    case "RESOLVE_CONTRADICTION": return `Resolve conflicting evidence about ${gap.label} without assuming which source is correct.`;
  }
};

/**
 * Converts a deterministic intelligence gap into an execution-neutral repair
 * contract. It does not call AI, choose sources, mutate Truth Index, or decide
 * whether the commercial hypothesis is desirable.
 */
export function createGenesisG8GapRepairContract(gap: GenesisG8IntelligenceGap): GenesisG8GapRepairContract {
  const mode = modeForGap(gap);
  return {
    claimId: gap.claimId,
    claimKey: gap.claimKey,
    label: gap.label,
    impactClass: gap.impactClass,
    reason: gap.reason,
    mode,
    disposition: dispositionForGap(gap),
    priority: gap.priority,
    currentConfidence: gap.confidence,
    evidenceCount: gap.evidenceCount,
    minimumEvidence: gap.minimumEvidence,
    additionalEvidenceNeeded: Math.max(0, gap.minimumEvidence - gap.evidenceCount),
    freshestEvidenceAt: gap.freshestEvidenceAt,
    objective: objectiveForGap(gap, mode),
  };
}

export function createGenesisG8GapRepairContracts(gaps: GenesisG8IntelligenceGap[]): GenesisG8GapRepairContract[] {
  return gaps
    .map(createGenesisG8GapRepairContract)
    .sort((a, b) => b.priority - a.priority || a.claimKey.localeCompare(b.claimKey));
}

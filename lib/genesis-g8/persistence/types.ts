import type { GenesisG8ChannelProvenance, GenesisG8IntelligenceChannel } from "../channels";
import type { IntelligenceContractVersion } from "../contracts";
import type {
  ClaimCriticality,
  EvidenceDirection,
  EvidenceSourceClass,
  TruthEntityType,
  TruthIndexResult,
  TruthReviewReason,
} from "../truth";

export type GenesisG8EntityStatus = "ACTIVE" | "SUPPRESSED" | "SUPERSEDED";
export type GenesisG8ReviewState =
  | "UNREVIEWED"
  | "NEEDS_REVIEW"
  | "HUMAN_APPROVED"
  | "HUMAN_CORRECTED"
  | "HUMAN_REJECTED";

export interface GenesisG8PersistedEntity {
  id: string;
  entityType: TruthEntityType;
  canonicalKey: string;
  displayName?: string | null;
  contractVersion: IntelligenceContractVersion;
  status: GenesisG8EntityStatus;
  reviewState: GenesisG8ReviewState;
  createdAt: string;
  updatedAt: string;
}

export interface GenesisG8PersistedClaim {
  id: string;
  entityId: string;
  claimKey: string;
  label: string;
  criticality: ClaimCriticality;
  weight: number;
  freshnessHalfLifeDays: number;
  countsTowardCoverage: boolean;
  minimumEvidence: number;
  createdAt: string;
  updatedAt: string;
}

export interface GenesisG8PersistedEvidence {
  id: string;
  claimId: string;
  direction: EvidenceDirection;
  sourceClass: EvidenceSourceClass;
  sourceUri?: string | null;
  sourceRef?: string | null;
  sourceFamily?: string | null;
  excerpt?: string | null;
  strength: number;
  traceability: number;
  independence: number;
  observedAt: string;
  channel: GenesisG8IntelligenceChannel;
  provenance: GenesisG8ChannelProvenance;
  createdAt: string;
}

export interface GenesisG8TruthSnapshot {
  id: string;
  entityId: string;
  equationVersion: string;
  contractVersion: IntelligenceContractVersion;
  confidence: number;
  coverage: number;
  truthIndex: number;
  criticalClaimCeiling: number;
  reviewRequired: boolean;
  reviewPriorityScore: number;
  reviewReasons: TruthReviewReason[];
  result: TruthIndexResult;
  calculatedAt: string;
}

export type GenesisG8HumanReviewAction = "APPROVE" | "CORRECT" | "REJECT" | "MORE_RESEARCH";

export interface GenesisG8HumanReviewReceipt {
  id: string;
  entityId: string;
  action: GenesisG8HumanReviewAction;
  reasonCode?: string | null;
  note?: string | null;
  correction?: Record<string, unknown> | null;
  reviewerUserId?: string | null;
  reviewedAt: string;
  truthSnapshotId?: string | null;
}

export interface GenesisG8EntityWrite {
  entityType: TruthEntityType;
  canonicalKey: string;
  displayName?: string | null;
  contractVersion: IntelligenceContractVersion;
}

export interface GenesisG8EvidenceWrite {
  claimId: string;
  direction: EvidenceDirection;
  sourceClass: EvidenceSourceClass;
  sourceUri?: string | null;
  sourceRef?: string | null;
  sourceFamily?: string | null;
  excerpt?: string | null;
  strength: number;
  traceability: number;
  independence: number;
  observedAt: string;
  channel: GenesisG8IntelligenceChannel;
  provenance: GenesisG8ChannelProvenance;
}

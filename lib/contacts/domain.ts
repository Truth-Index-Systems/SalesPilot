import type { ContactConfidenceLabel, ContactReviewStatus } from "./schemas";

export type Contact = {
  id: string;
  organisationId: string;
  campaignId: string;
  companyId: string;
  contactDiscoverySessionId: string;
  fullName: string;
  roleTitle: string;
  department: string | null;
  location: string | null;
  reasonSelected: string;
  identityConfidence: number;
  roleConfidence: number;
  buyingRelevance: number;
  operationalRelevance: number;
  evidenceQuality: number;
  overallConfidence: number;
  confidenceLabel: ContactConfidenceLabel;
  unknowns: string[];
  riskFlags: string[];
  reviewStatus: ContactReviewStatus;
  createdAt: string;
  updatedAt: string;
};

export type ContactDiscoverySessionStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
export type ContactDiscoveryStage = "PREPARING" | "RESEARCHING" | "IDENTIFYING" | "VALIDATING" | "SAVING" | "COMPLETE";

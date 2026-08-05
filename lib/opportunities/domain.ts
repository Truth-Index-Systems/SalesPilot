export const OPPORTUNITY_STATUSES = [
  "BUILDING",
  "READY",
  "NEEDS_CONTACT",
  "NEEDS_EVIDENCE",
  "LOW_PRIORITY",
  "APPROVED",
  "REJECTED",
  "ENGAGED",
] as const;

export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export type OpportunityFoundation = {
  id: string;
  organisation_id: string;
  campaign_id: string;
  company_id: string;
  primary_contact_id: string | null;
  status: OpportunityStatus;
  opportunity_score: number | null;
  company_fit: number | null;
  operational_fit: number | null;
  buying_authority: number | null;
  contactability: number | null;
  commercial_value: number | null;
  evidence_quality: number | null;
  urgency: number | null;
  buying_reason: string | null;
  recommended_action: string | null;
  rank: number;
  created_at: string;
  updated_at: string;
};

export type OpportunitySyncSummary = {
  created: number;
  updated: number;
  ranked: number;
  ready: number;
  needsContact: number;
};

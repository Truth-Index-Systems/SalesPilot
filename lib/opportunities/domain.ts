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

export type OpportunityScoreExplanation = {
  version: "opportunity-score/v1";
  weights: {
    companyFit: number;
    operationalFit: number;
    buyingAuthority: number;
    contactability: number;
    evidenceQuality: number;
    commercialValue: number;
    urgency: number;
  };
  components: Record<string, number>;
  evidence: {
    companySources: number;
    contactSources: number;
    contactChannel: string;
  };
  limitations: string[];
};

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
  operational_pain: string | null;
  recommended_action: string | null;
  score_explanation_json: OpportunityScoreExplanation | null;
  scoring_version: string | null;
  scored_at: string | null;
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

export type OpportunityScoringSummary = {
  scored: number;
  reranked: number;
  recommended: number;
  review: number;
  needsContact: number;
  needsEvidence: number;
  lowPriority: number;
};

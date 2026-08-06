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
  version: "opportunity-score/v1" | "opportunity-score/v2-route-quality";
  weights: {
    companyFit: number;
    operationalFit: number;
    buyingAuthority?: number;
    contactability?: number;
    routeQuality?: number;
    routeConfidence?: number;
    evidenceQuality: number;
    commercialValue: number;
    urgency: number;
  };
  components: Record<string, number>;
  evidence: {
    companySources: number;
    contactSources: number;
    contactChannel?: string;
    routeChannel?: string;
  };
  recommendedEntryStrategy?: string;
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
  route_quality: number | null;
  route_confidence: number | null;
  recommended_entry_strategy: string | null;
  commercial_value: number | null;
  evidence_quality: number | null;
  urgency: number | null;
  buying_reason: string | null;
  operational_pain: string | null;
  recommended_action: string | null;
  score_explanation_json: OpportunityScoreExplanation | null;
  scoring_version: string | null;
  scored_at: string | null;
  review_note: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  rank: number;
  created_at: string;
  updated_at: string;
};

export type OpportunityOverview = OpportunityFoundation & {
  campaign_name: string;
  company_name: string;
  company_website_url: string;
  company_industry: string | null;
  company_country: string | null;
  company_summary: string | null;
  company_confidence: number;
  primary_contact_name: string | null;
  primary_contact_role: string | null;
  primary_contact_department: string | null;
  primary_contact_location: string | null;
  contact_reason_selected: string | null;
  primary_contact_confidence: number | null;
  primary_contact_review_status: string | null;
  primary_contact_email: string | null;
  primary_contact_email_status: string | null;
  primary_contact_linkedin_url: string | null;
  company_evidence_count: number;
  contact_evidence_count: number;
  primary_route_id: string | null;
  primary_route_email: string | null;
  primary_route_verification_status: string | null;
  primary_route_score: number | null;
  primary_route_confidence: number | null;
  primary_route_response_likelihood: number | null;
  primary_route_campaign_relevance: number | null;
  primary_route_channel_type: string | null;
  available_route_count: number;
  primary_route_likely_reader: string | null;
  primary_route_reason: string | null;
  primary_route_source_url: string | null;
};

export type OpportunityDetail = OpportunityOverview & {
  company_evidence: Array<Record<string, unknown>>;
  contact_evidence: Array<Record<string, unknown>>;
  history: Array<Record<string, unknown>>;
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

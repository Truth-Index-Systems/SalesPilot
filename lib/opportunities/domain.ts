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
  version: "opportunity-score/v1" | "opportunity-score/v2-route-quality" | "opportunity-score/v3-route-intelligence";
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

export const CIE_OPPORTUNITY_AUTHORITY_STATES = [
  "AWAITING_COMMERCIAL_REALITY",
  "COMMERCIAL_AUTHORITY_STALE",
  "REJECTED",
  "TEMPORAL_HOLD",
  "RESEARCH_REQUIRED",
  "ROUTE_UNRESOLVED",
  "ROUTE_STALE",
  "CONTACT_UNRESOLVED",
  "CONTACT_STALE",
  "READY",
] as const;

export type CieOpportunityAuthorityState = (typeof CIE_OPPORTUNITY_AUTHORITY_STATES)[number];

export type OpportunityOverview = OpportunityFoundation & {
  campaign_name: string;
  company_name: string;
  company_website_url: string;
  company_industry: string | null;
  company_country: string | null;
  company_summary: string | null;
  company_confidence: number | null;
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
  commercial_route_id: string | null;
  commercial_route_type: string | null;
  commercial_route_label: string | null;
  commercial_route_entry_role: string | null;
  commercial_route_target_role: string | null;
  commercial_route_department: string | null;
  commercial_route_contact_name: string | null;
  commercial_route_contact_role: string | null;
  commercial_route_channel_type: string | null;
  commercial_route_channel_value: string | null;
  commercial_route_quality: number | null;
  commercial_route_confidence: number | null;
  commercial_route_authority: number | null;
  commercial_route_accessibility: number | null;
  commercial_route_evidence_quality: number | null;
  commercial_route_resilience: number | null;
  commercial_route_difficulty: string | null;
  commercial_route_rationale: string | null;
  commercial_route_next_step: string | null;
  commercial_route_count: number;
  commercial_route_evidence_count: number;
  organisation_map: Record<string, unknown> | null;
  buying_paths: Array<Record<string, unknown>> | null;
  authority_state: CieOpportunityAuthorityState;
  authority_ready: boolean;
  authority_current: boolean;
  workflow_authority_mismatch: boolean;
  r4_current: boolean;
  r5_current: boolean;
  r6_current: boolean;
  r4_reality_id: string | null;
  r4_reality_state: string | null;
  r4_disposition: string | null;
  r4_input_fingerprint: string | null;
  r4_authority_fingerprint: string | null;
  r4_seller_context_fingerprint: string | null;
  r4_constraint_fingerprint: string | null;
  target_truth_entity_id: string | null;
  target_truth_snapshot_id: string | null;
  target_truth_semantics_version: string | null;
  r4_producer_version: string | null;
  r4_production_id: string | null;
  r4_decision_json: Record<string, unknown> | null;
  r4_last_validated_at: string | null;
  r4_next_validation_at: string | null;
  r4_last_invalidation_reason: string | null;
  r4_updated_at: string | null;
  r5_authority_status: string | null;
  r5_producer_version: string | null;
  r5_source_fingerprint: string | null;
  r5_authority_fingerprint: string | null;
  r5_selected_route_ids: string[] | null;
  r5_route_states_json: Array<Record<string, unknown>> | null;
  r5_strategy_json: Record<string, unknown> | null;
  r5_graph_assessment_json: Record<string, unknown> | null;
  r5_invalidation_reason: string | null;
  r5_invalidated_at: string | null;
  r5_updated_at: string | null;
  r6_authority_status: string | null;
  r6_producer_version: string | null;
  r6_source_fingerprint: string | null;
  r6_contact_truth_fingerprint: string | null;
  r6_contact_truth_json: Array<Record<string, unknown>> | null;
  r6_contact_frontier_json: Array<Record<string, unknown>> | null;
  r6_bindings_json: Array<Record<string, unknown>> | null;
  r6_decision_json: Record<string, unknown> | null;
  r6_next_revalidation_at: string | null;
  r6_invalidation_reason: string | null;
  r6_invalidated_at: string | null;
  r6_updated_at: string | null;
  authority_truth_index: number | null;
  authority_truth_coverage: number | null;
  authority_evidence_sufficiency: number | null;
  authority_truth_review_state: string | null;
  authority_probability_state: string | null;
  authority_truth_calculated_at: string | null;
  active_research_count: number;
  active_research_json: Array<Record<string, unknown>>;
  latest_invalidation_layer: string | null;
  latest_invalidation_reason: string | null;
  latest_invalidation_at: string | null;
};

export type OpportunityDetail = OpportunityOverview & {
  company_evidence: Array<Record<string, unknown>>;
  contact_evidence: Array<Record<string, unknown>>;
  commercial_routes: Array<Record<string, unknown>>;
  commercial_route_evidence: Array<Record<string, unknown>>;
  history: Array<Record<string, unknown>>;
  authority_history: Array<Record<string, unknown>>;
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

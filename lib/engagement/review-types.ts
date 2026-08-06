export type EngagementReviewOverview = {
  id: string; organisation_id: string; campaign_id: string; opportunity_id: string; company_id: string; contact_id: string | null;
  status: string; campaign_name: string; company_name: string; recipient_name: string | null; recipient_role: string | null; recipient_email: string | null;
  channel_type: string; route_quality: number | null; route_confidence: number | null; recommended_entry_strategy: string | null; opportunity_score: number | null; buying_reason: string | null; operational_pain: string | null; recommended_action: string | null;
  draft_id: string | null; subject: string | null; opening: string | null; personalisation: string | null; buying_angle: string | null;
  primary_pain: string | null; value_proposition: string | null; supporting_evidence_json: Array<Record<string, unknown>>;
  call_to_action: string | null; tone: string | null; reasoning: string | null; limitations_json: string[];
  personalisation_score: number | null; relevance_score: number | null; professionalism_score: number | null; factual_accuracy_score: number | null;
  evidence_use_score: number | null; likelihood_of_response_score: number | null; ai_engagement_score: number | null; ai_confidence: number | null;
  review_notes: string | null; strengths_json: string[]; weaknesses_json: string[]; recommended_changes_json: string[]; unsupported_claims_json: string[];
  commercial_objective: string | null; commercial_buying_angle: string | null; commercial_primary_pain: string | null; value_theme: string | null;
  buyer_priorities_json: string[]; likely_objections_json: string[]; recommended_tone: string | null; cta_strategy: string | null; commercial_reasoning: string | null; route_strategy_json: Record<string, unknown> | null; route_alignment_json: Record<string, unknown> | null;
};

export type HumanReviewAction = "APPROVED" | "EDITED" | "REJECTED" | "REGENERATE_REQUESTED";
export type EngagementDraftEdit = { subject: string; opening: string; personalisation?: string; valueProposition: string; callToAction: string };

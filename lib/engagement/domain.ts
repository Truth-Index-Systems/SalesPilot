export const ENGAGEMENT_STATUSES = [
  "NEEDS_ROUTE",
  "READY_FOR_DRAFT",
  "DRAFT_REVIEW",
  "APPROVED_TO_SEND",
  "QUEUED_FOR_SEND",
  "SENT",
  "PAUSED",
  "CANCELLED",
] as const;

export type EngagementStatus = (typeof ENGAGEMENT_STATUSES)[number];

export type EngagementOverview = {
  id: string;
  organisation_id: string;
  campaign_id: string;
  opportunity_id: string;
  company_id: string;
  contact_id: string | null;
  status: EngagementStatus;
  outreach_policy: "MANUAL" | "REVIEW_FIRST" | "AUTO_SEND";
  reply_policy: "MANUAL" | "SUGGEST" | "AUTO_RESPOND";
  market_learning_enabled: boolean;
  channel_type: "EMAIL" | "LINKEDIN" | "NONE";
  recipient_name: string | null;
  recipient_role: string | null;
  recipient_email: string | null;
  linkedin_profile_url: string | null;
  route_verification_status: string | null;
  route_source_url: string | null;
  source_opportunity_score: number | null;
  source_opportunity_rank: number;
  prepared_at: string;
  updated_at: string;
  campaign_name: string;
  company_name: string;
  opportunity_score: number | null;
  buying_reason: string | null;
  recommended_action: string | null;
};

export type EngagementSyncSummary = {
  created: number;
  updated: number;
  cancelled: number;
  readyForDraft: number;
  needsRoute: number;
};

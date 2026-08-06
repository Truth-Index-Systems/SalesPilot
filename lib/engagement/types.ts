export const ENGAGEMENT_STATUSES = [
  "NEEDS_ROUTE",
  "READY_FOR_DRAFT",
  "DRAFT_READY",
  "DRAFT_REVIEW",
  "APPROVED_TO_SEND",
  "QUEUED_FOR_SEND",
  "SENT",
  "PAUSED",
  "CANCELLED",
] as const;

export type EngagementStatus = (typeof ENGAGEMENT_STATUSES)[number];
export type EngagementChannel = "EMAIL" | "LINKEDIN" | "WEBSITE_FORM" | "PHONE" | "REFERRAL" | "PROCUREMENT" | "EXECUTIVE_ASSISTANT" | "EXISTING_CUSTOMER" | "PARTNER" | "INTERNAL_CHAMPION" | "NONE";
export type OutreachPolicy = "MANUAL" | "REVIEW_FIRST" | "AUTO_SEND";
export type ReplyPolicy = "MANUAL" | "SUGGEST" | "AUTO_RESPOND";

export type Engagement = {
  id: string;
  organisation_id: string;
  campaign_id: string;
  opportunity_id: string;
  company_id: string;
  contact_id: string | null;
  status: EngagementStatus;
  outreach_policy: OutreachPolicy;
  reply_policy: ReplyPolicy;
  market_learning_enabled: boolean;
  channel_type: EngagementChannel;
  recipient_name: string | null;
  recipient_role: string | null;
  recipient_email: string | null;
  linkedin_profile_url: string | null;
  route_verification_status: string | null;
  route_source_url: string | null;
  source_opportunity_score: number | null;
  source_opportunity_rank: number;
  generation_version: string | null;
  prompt_version: string | null;
  engagement_score: number | null;
  confidence: number | null;
  prepared_at: string;
  created_at: string;
  updated_at: string;
  primary_channel?: EngagementChannel | null;
  secondary_channel?: EngagementChannel | null;
  fallback_channel?: EngagementChannel | null;
  entry_strategy?: string | null;
  recommendation_reason?: string | null;
  strategy_confidence?: number | null;
  pipeline_state?: string;
  current_stage?: string;
  stage_reason?: string | null;
  stage_attempts?: number;
  stage_last_attempt_at?: string | null;
  stage_next_retry_at?: string | null;
  stage_failure_reason?: string | null;
};

export type EngagementOverview = Engagement & {
  campaign_name: string;
  company_name: string;
  opportunity_score: number | null;
  buying_reason: string | null;
  operational_pain: string | null;
  recommended_action: string | null;
};

export type EngagementHistoryEvent =
  | "PREPARED"
  | "ROUTE_UPDATED"
  | "POLICY_UPDATED"
  | "STATUS_CHANGED"
  | "UPDATED"
  | "PAUSED"
  | "CANCELLED"
  | "DRAFT_GENERATION_STARTED"
  | "DRAFT_CREATED"
  | "DRAFT_GENERATION_FAILED"
  | "SELF_REVIEW_STARTED"
  | "SELF_REVIEW_COMPLETED"
  | "SELF_REVIEW_FAILED"
  | "APPROVED_TO_SEND"
  | "QUEUED"
  | "SENT";

export type EngagementHistory = {
  id: string;
  organisation_id: string;
  campaign_id: string;
  engagement_id: string;
  opportunity_id: string;
  event_type: EngagementHistoryEvent;
  previous_status: EngagementStatus | null;
  next_status: EngagementStatus | null;
  metadata_json: Record<string, unknown>;
  occurred_at: string;
};

export type EngagementSummary = {
  total: number;
  readyForDraft: number;
  needsRoute: number;
  inReview: number;
  queued: number;
  sent: number;
};

export type EngagementSyncSummary = {
  created: number;
  updated: number;
  cancelled: number;
  readyForDraft: number;
  needsRoute: number;
};

export type EngagementBuilderStatus = "RUNNING" | "COMPLETED" | "FAILED";

export type EngagementBuilderResult = EngagementSyncSummary & {
  builderRunId: string | null;
  schedulerRunId: string;
  status: EngagementBuilderStatus;
  startedAt: string | null;
  completedAt: string | null;
};

export type EngagementFilters = {
  campaignId?: string;
  opportunityId?: string;
  status?: EngagementStatus;
};

export type EngagementUpdate = {
  status?: EngagementStatus;
  generationVersion?: string | null;
  promptVersion?: string | null;
  engagementScore?: number | null;
  confidence?: number | null;
};

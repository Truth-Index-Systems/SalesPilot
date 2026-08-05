/** Canonical customer-visible campaign stage contract for Genesis. */
export const PIPELINE_CAMPAIGN_STAGES = [
  "BUSINESS_ANALYSIS",
  "CAMPAIGN_REVIEW",
  "COMPANY_DISCOVERY",
  "COMPANY_REVIEW",
  "CONTACT_DISCOVERY",
  "CONTACT_REVIEW",
  "OUTREACH_READY",
  "OUTREACH",
  "REPLIES",
  "OPPORTUNITIES",
  "PAUSED",
  "ARCHIVED",
] as const;

export type PipelineCampaignStage = (typeof PIPELINE_CAMPAIGN_STAGES)[number];

export type CampaignStateFacts = {
  campaignPaused: boolean;
  campaignArchived: boolean;
  businessAnalysisReady: boolean;
  campaignApproved: boolean;
  companyDiscoveryActive: boolean;
  companiesAwaitingReview: number;
  approvedCompanies: number;
  contactDiscoveryActive: boolean;
  contactsAwaitingReview: number;
  approvedReachableContacts: number;
  outreachStarted: boolean;
  repliesReceived: boolean;
  opportunitiesCreated: boolean;
};

/**
 * Derives one deterministic visible stage from persisted facts.
 * Later stabilisation stages will make this the sole UI stage authority.
 */
export function derivePipelineCampaignStage(facts: CampaignStateFacts): PipelineCampaignStage {
  if (facts.campaignArchived) return "ARCHIVED";
  if (facts.campaignPaused) return "PAUSED";
  if (!facts.businessAnalysisReady) return "BUSINESS_ANALYSIS";
  if (!facts.campaignApproved) return "CAMPAIGN_REVIEW";
  if (facts.opportunitiesCreated) return "OPPORTUNITIES";
  if (facts.repliesReceived) return "REPLIES";
  if (facts.outreachStarted) return "OUTREACH";
  if (facts.approvedReachableContacts > 0 && facts.contactsAwaitingReview === 0 && !facts.contactDiscoveryActive) {
    return "OUTREACH_READY";
  }
  if (facts.contactsAwaitingReview > 0) return "CONTACT_REVIEW";
  if (facts.contactDiscoveryActive || facts.approvedCompanies > 0) return "CONTACT_DISCOVERY";
  if (facts.companiesAwaitingReview > 0) return "COMPANY_REVIEW";
  if (facts.companyDiscoveryActive) return "COMPANY_DISCOVERY";
  return "COMPANY_DISCOVERY";
}

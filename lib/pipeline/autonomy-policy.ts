/**
 * Future-facing autonomy policy contract.
 * S5 persists this policy but defaults every campaign to human-guided mode.
 * Later Genesis stages may consume these values without creating a second pipeline.
 */
export const REVIEW_POLICIES = ["MANUAL", "AUTO"] as const;
export const OUTREACH_POLICIES = ["MANUAL", "REVIEW_FIRST", "AUTO_SEND"] as const;
export const REPLY_POLICIES = ["MANUAL", "SUGGEST", "AUTO_RESPOND"] as const;

export type CampaignAutonomyPolicy = {
  companyReview: (typeof REVIEW_POLICIES)[number];
  contactReview: (typeof REVIEW_POLICIES)[number];
  outreachApproval: (typeof OUTREACH_POLICIES)[number];
  replyHandling: (typeof REPLY_POLICIES)[number];
  marketLearningEnabled: boolean;
};

export const DEFAULT_CAMPAIGN_AUTONOMY_POLICY: CampaignAutonomyPolicy = {
  companyReview: "MANUAL",
  contactReview: "MANUAL",
  outreachApproval: "MANUAL",
  replyHandling: "SUGGEST",
  marketLearningEnabled: false,
};

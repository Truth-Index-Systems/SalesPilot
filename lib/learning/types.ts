export type EngagementLearningBuilderResult = {
  inspected: number;
  created: number;
  existing: number;
  skipped: number;
};

export type EngagementLearningRecord = {
  id: string;
  organisationId: string;
  campaignId: string;
  engagementId: string;
  opportunityId: string;
  companyId: string;
  contactId: string | null;
  engagementScore: number | null;
  confidence: number | null;
  humanAction: string | null;
  editDistance: number | null;
  queueOutcome: string;
  createdAt: string;
};

import type { EngagementLearningRecord } from "./types";
import { EngagementLearningRecordSchema } from "./validators";

export function mapEngagementLearningRecord(input: unknown): EngagementLearningRecord {
  const row = EngagementLearningRecordSchema.parse(input);
  return {
    id: row.id,
    organisationId: row.organisation_id,
    campaignId: row.campaign_id,
    engagementId: row.engagement_id,
    opportunityId: row.opportunity_id,
    companyId: row.company_id,
    contactId: row.contact_id,
    engagementScore: row.engagement_score,
    confidence: row.confidence,
    humanAction: row.human_action,
    editDistance: row.edit_distance,
    queueOutcome: row.queue_outcome,
    createdAt: row.created_at,
  };
}

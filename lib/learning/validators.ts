import { z } from "zod";

export const EngagementLearningRecordSchema = z.object({
  id: z.string().uuid(),
  organisation_id: z.string().uuid(),
  campaign_id: z.string().uuid(),
  engagement_id: z.string().uuid(),
  opportunity_id: z.string().uuid(),
  company_id: z.string().uuid(),
  contact_id: z.string().uuid().nullable(),
  engagement_score: z.number().int().min(0).max(100).nullable(),
  confidence: z.number().int().min(0).max(100).nullable(),
  human_action: z.string().nullable(),
  edit_distance: z.number().int().nonnegative().nullable(),
  queue_outcome: z.string(),
  created_at: z.string(),
});

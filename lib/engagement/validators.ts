import { z } from "zod";
import { ENGAGEMENT_STATUSES } from "./types";

export const EngagementStatusSchema = z.enum(ENGAGEMENT_STATUSES);

export const EngagementIdSchema = z.string().uuid();

export const EngagementFiltersSchema = z.object({
  campaignId: z.string().uuid().optional(),
  opportunityId: z.string().uuid().optional(),
  status: EngagementStatusSchema.optional(),
});

export const EngagementUpdateSchema = z.object({
  status: EngagementStatusSchema.optional(),
  generationVersion: z.string().trim().min(1).max(120).nullable().optional(),
  promptVersion: z.string().trim().min(1).max(120).nullable().optional(),
  engagementScore: z.number().int().min(0).max(100).nullable().optional(),
  confidence: z.number().int().min(0).max(100).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one engagement field is required");

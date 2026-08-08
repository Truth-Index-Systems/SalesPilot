import { z } from "zod";
import { AiEnvelopeSchema } from "@/lib/ai/contracts";
import { BusinessDnaPayloadSchema } from "@/lib/ai/schemas/business-dna";

export const CampaignStatusSchema = z.enum(["DRAFT", "PREPARING", "READY", "PAUSED", "ARCHIVED"]);
export const AutomationModeSchema = z.enum(["autopilot", "approval", "assisted"]);

export const LaunchCampaignRequestSchema = z.object({
  businessAnalysis: AiEnvelopeSchema(BusinessDnaPayloadSchema),
  selectedProposalId: z.string().min(1),
  websiteUrl: z.string().url(),
  idempotencyKey: z.string().min(12).max(200),
  knowledgeMatch: z.unknown().optional(),
});

export const CampaignSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  objective: z.string(),
  status: CampaignStatusSchema,
  automationMode: AutomationModeSchema,
  fitScore: z.number().int().min(0).max(100),
  audience: z.string(),
  createdAt: z.string(),
  latestProgress: z.string().nullable(),
});

export const CampaignDetailSchema = CampaignSummarySchema.extend({
  buyerRoles: z.array(z.string()),
  messageAngle: z.string(),
  why: z.array(z.string()),
  businessName: z.string(),
  businessSummary: z.string(),
  websiteUrl: z.string().url(),
  timeline: z.array(z.object({
    id: z.string().uuid(),
    title: z.string(),
    description: z.string().nullable(),
    occurredAt: z.string(),
  })),
});

export type LaunchCampaignRequest = z.infer<typeof LaunchCampaignRequestSchema>;
export type CampaignSummary = z.infer<typeof CampaignSummarySchema>;
export type CampaignDetail = z.infer<typeof CampaignDetailSchema>;

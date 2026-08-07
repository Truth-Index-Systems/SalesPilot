import { z } from "zod";

const Score = z.number().int().min(0).max(100);

export const G5EngagementQualitySchema = z.object({
  schemaVersion: z.literal("g5-engagement-quality/v1"),
  policyVersion: z.literal("g5-engagement-quality/v1"),
  engagementConfidence: Score,
  dimensions: z.object({
    commercialRelevance: Score,
    routeAlignment: Score,
    evidenceStrength: Score,
    personalisationQuality: Score,
    messageClarity: Score,
    ctaQuality: Score,
    channelSuitability: Score,
    riskSafety: Score,
  }),
  strengths: z.array(z.string().min(1).max(300)).max(12),
  cautions: z.array(z.string().min(1).max(300)).max(12),
  explainability: z.array(z.object({
    code: z.string().min(1).max(80),
    label: z.string().min(1).max(180),
    passed: z.boolean(),
    score: Score.nullable(),
  })).max(20),
  source: z.object({
    selfReviewOutcome: z.literal("PASS"),
    selfReviewConfidence: Score,
    channelConfidence: Score,
    verifiedFactCount: z.number().int().min(0),
    commercialInferenceCount: z.number().int().min(0),
    rewriteCount: z.number().int().min(0),
  }),
  immutableG4: z.literal(true),
});

export type G5EngagementQuality = z.infer<typeof G5EngagementQualitySchema>;

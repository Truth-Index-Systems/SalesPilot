import { z } from "zod";

const Score = z.number().int().min(0).max(100);

export const EngagementSelfReviewSchema = z.object({
  schemaVersion: z.literal("engagement-self-review/v1"),
  promptVersion: z.literal("engagement-self-review/v1"),
  personalisation: Score,
  relevance: Score,
  professionalism: Score,
  factualAccuracy: Score,
  evidenceUse: Score,
  likelihoodOfResponse: Score,
  confidence: Score,
  combinedScore: Score,
  approvedByAI: z.boolean(),
  reviewNotes: z.string().min(1).max(1800),
  strengths: z.array(z.string().min(1).max(350)).max(8),
  weaknesses: z.array(z.string().min(1).max(350)).max(8),
  recommendedChanges: z.array(z.string().min(1).max(500)).max(10),
  unsupportedClaims: z.array(z.string().min(1).max(500)).max(10),
});

export type EngagementSelfReview = z.infer<typeof EngagementSelfReviewSchema>;

export const engagementSelfReviewJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion", "promptVersion", "personalisation", "relevance", "professionalism",
    "factualAccuracy", "evidenceUse", "likelihoodOfResponse", "confidence", "combinedScore",
    "approvedByAI", "reviewNotes", "strengths", "weaknesses", "recommendedChanges", "unsupportedClaims",
  ],
  properties: {
    schemaVersion: { type: "string", enum: ["engagement-self-review/v1"] },
    promptVersion: { type: "string", enum: ["engagement-self-review/v1"] },
    personalisation: { type: "integer", minimum: 0, maximum: 100 },
    relevance: { type: "integer", minimum: 0, maximum: 100 },
    professionalism: { type: "integer", minimum: 0, maximum: 100 },
    factualAccuracy: { type: "integer", minimum: 0, maximum: 100 },
    evidenceUse: { type: "integer", minimum: 0, maximum: 100 },
    likelihoodOfResponse: { type: "integer", minimum: 0, maximum: 100 },
    confidence: { type: "integer", minimum: 0, maximum: 100 },
    combinedScore: { type: "integer", minimum: 0, maximum: 100 },
    approvedByAI: { type: "boolean" },
    reviewNotes: { type: "string" },
    strengths: { type: "array", maxItems: 8, items: { type: "string" } },
    weaknesses: { type: "array", maxItems: 8, items: { type: "string" } },
    recommendedChanges: { type: "array", maxItems: 10, items: { type: "string" } },
    unsupportedClaims: { type: "array", maxItems: 10, items: { type: "string" } },
  },
} as const;

import { z } from "zod";

const Score = z.number().int().min(0).max(100);
export const G5SelfReviewOutcome = z.enum(["PASS", "REWRITE", "BLOCK"]);

export const G5SelfReviewSchema = z.object({
  schemaVersion: z.literal("g5-self-review/v1"),
  promptVersion: z.literal("g5-self-review/v4-fb8-categorical-quality"),
  outcome: G5SelfReviewOutcome,
  factualAccuracy: Score,
  evidenceAlignment: Score,
  routeAlignment: Score,
  hallucinationRisk: Score,
  tone: Score,
  messageLength: Score,
  commercialClarity: Score,
  ctaQuality: Score,
  spamCharacteristics: Score,
  overclaiming: Score,
  personalisationRelevance: Score,
  overallConfidence: Score,
  criticism: z.array(z.string().min(1).max(500)).max(12),
  rewriteInstructions: z.array(z.string().min(1).max(500)).max(12),
  unsupportedClaims: z.array(z.string().min(1).max(500)).max(12),
  blockedReasons: z.array(z.string().min(1).max(500)).max(12),
  strengths: z.array(z.string().min(1).max(400)).max(8),
});
export type G5SelfReview = z.infer<typeof G5SelfReviewSchema>;

export const g5SelfReviewJsonSchema = {
  type: "object", additionalProperties: false,
  required: ["schemaVersion","promptVersion","outcome","factualAccuracy","evidenceAlignment","routeAlignment","hallucinationRisk","tone","messageLength","commercialClarity","ctaQuality","spamCharacteristics","overclaiming","personalisationRelevance","overallConfidence","criticism","rewriteInstructions","unsupportedClaims","blockedReasons","strengths"],
  properties: {
    schemaVersion:{type:"string",enum:["g5-self-review/v1"]}, promptVersion:{type:"string",enum:["g5-self-review/v4-fb8-categorical-quality"]},
    outcome:{type:"string",enum:["PASS","REWRITE","BLOCK"]},
    factualAccuracy:{type:"integer",minimum:0,maximum:100}, evidenceAlignment:{type:"integer",minimum:0,maximum:100}, routeAlignment:{type:"integer",minimum:0,maximum:100},
    hallucinationRisk:{type:"integer",minimum:0,maximum:100}, tone:{type:"integer",minimum:0,maximum:100}, messageLength:{type:"integer",minimum:0,maximum:100},
    commercialClarity:{type:"integer",minimum:0,maximum:100}, ctaQuality:{type:"integer",minimum:0,maximum:100}, spamCharacteristics:{type:"integer",minimum:0,maximum:100},
    overclaiming:{type:"integer",minimum:0,maximum:100}, personalisationRelevance:{type:"integer",minimum:0,maximum:100}, overallConfidence:{type:"integer",minimum:0,maximum:100},
    criticism:{type:"array",maxItems:12,items:{type:"string"}}, rewriteInstructions:{type:"array",maxItems:12,items:{type:"string"}}, unsupportedClaims:{type:"array",maxItems:12,items:{type:"string"}}, blockedReasons:{type:"array",maxItems:12,items:{type:"string"}}, strengths:{type:"array",maxItems:8,items:{type:"string"}},
  }
} as const;

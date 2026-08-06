import { z } from "zod";

const Score = z.number().int().min(0).max(100);
export const CommercialReasoningSchema = z.object({
  schemaVersion: z.literal("engagement-commercial-reasoning/v1"),
  promptVersion: z.literal("engagement-commercial-reasoning/v1"),
  commercialObjective: z.string().min(1).max(500),
  buyingAngle: z.string().min(1).max(500),
  primaryPain: z.string().min(1).max(500),
  urgency: z.object({ score: Score, explanation: z.string().min(1).max(500) }),
  commercialRisk: z.string().min(1).max(500),
  valueTheme: z.string().min(1).max(500),
  buyerPriorities: z.array(z.string().min(1).max(240)).max(8),
  likelyObjections: z.array(z.string().min(1).max(240)).max(8),
  recommendedTone: z.enum(["EXECUTIVE","CONSULTATIVE","OPERATIONAL","TECHNICAL","DIRECT","WARM"]),
  ctaStrategy: z.string().min(1).max(500),
  evidenceReferences: z.array(z.object({
    evidenceType: z.enum(["COMPANY","CONTACT","OPPORTUNITY","BUSINESS_DNA","CAMPAIGN"]),
    sourceId: z.string().min(1).max(200),
    supportedClaim: z.string().min(1).max(500),
  })).max(20),
  limitations: z.array(z.string().min(1).max(300)).max(12),
  confidence: Score,
  reasoning: z.string().min(1).max(1500),
});
export type CommercialReasoning = z.infer<typeof CommercialReasoningSchema>;

export const commercialReasoningJsonSchema = {
  type: "object", additionalProperties: false,
  required: ["schemaVersion","promptVersion","commercialObjective","buyingAngle","primaryPain","urgency","commercialRisk","valueTheme","buyerPriorities","likelyObjections","recommendedTone","ctaStrategy","evidenceReferences","limitations","confidence","reasoning"],
  properties: {
    schemaVersion:{type:"string",enum:["engagement-commercial-reasoning/v1"]},
    promptVersion:{type:"string",enum:["engagement-commercial-reasoning/v1"]},
    commercialObjective:{type:"string"}, buyingAngle:{type:"string"}, primaryPain:{type:"string"},
    urgency:{type:"object",additionalProperties:false,required:["score","explanation"],properties:{score:{type:"integer",minimum:0,maximum:100},explanation:{type:"string"}}},
    commercialRisk:{type:"string"}, valueTheme:{type:"string"},
    buyerPriorities:{type:"array",maxItems:8,items:{type:"string"}}, likelyObjections:{type:"array",maxItems:8,items:{type:"string"}},
    recommendedTone:{type:"string",enum:["EXECUTIVE","CONSULTATIVE","OPERATIONAL","TECHNICAL","DIRECT","WARM"]}, ctaStrategy:{type:"string"},
    evidenceReferences:{type:"array",maxItems:20,items:{type:"object",additionalProperties:false,required:["evidenceType","sourceId","supportedClaim"],properties:{evidenceType:{type:"string",enum:["COMPANY","CONTACT","OPPORTUNITY","BUSINESS_DNA","CAMPAIGN"]},sourceId:{type:"string"},supportedClaim:{type:"string"}}}},
    limitations:{type:"array",maxItems:12,items:{type:"string"}}, confidence:{type:"integer",minimum:0,maximum:100}, reasoning:{type:"string"}
  }
} as const;

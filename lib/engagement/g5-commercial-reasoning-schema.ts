import { z } from "zod";

const Score = z.number().int().min(0).max(100);

export const G5CommercialReasoningSchema = z.object({
  schemaVersion: z.literal("g5-commercial-reasoning/v1"),
  promptVersion: z.literal("g5-commercial-reasoning/v1"),
  whyThisCompany: z.string().min(1).max(700),
  whyThisRoute: z.string().min(1).max(700),
  whyNow: z.string().min(1).max(700),
  primaryProblem: z.string().min(1).max(500),
  commercialConsequence: z.string().min(1).max(700),
  credibleOutcome: z.string().min(1).max(700),
  entryProposition: z.string().min(1).max(700),
  smallestReasonableCommitment: z.string().min(1).max(500),
  likelyObjection: z.string().min(1).max(500),
  objectionResponsePrinciple: z.string().min(1).max(700),
  safeEvidence: z.array(z.object({
    sourceType: z.enum(["BUSINESS_DNA","CAMPAIGN","COMPANY","CONTACT","ROUTE","OPPORTUNITY"]),
    sourceId: z.string().min(1).max(200),
    claim: z.string().min(1).max(500),
    usage: z.string().min(1).max(500),
  })).max(16),
  prohibitedClaims: z.array(z.string().min(1).max(400)).max(16),
  commercialInferences: z.array(z.string().min(1).max(400)).max(12),
  limitations: z.array(z.string().min(1).max(400)).max(12),
  reasoningConfidence: Score,
  reasoningSummary: z.string().min(1).max(1500),
});

export type G5CommercialReasoning = z.infer<typeof G5CommercialReasoningSchema>;

export const g5CommercialReasoningJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion","promptVersion","whyThisCompany","whyThisRoute","whyNow","primaryProblem",
    "commercialConsequence","credibleOutcome","entryProposition","smallestReasonableCommitment",
    "likelyObjection","objectionResponsePrinciple","safeEvidence","prohibitedClaims","commercialInferences",
    "limitations","reasoningConfidence","reasoningSummary",
  ],
  properties: {
    schemaVersion: { type: "string", enum: ["g5-commercial-reasoning/v1"] },
    promptVersion: { type: "string", enum: ["g5-commercial-reasoning/v1"] },
    whyThisCompany: { type: "string" },
    whyThisRoute: { type: "string" },
    whyNow: { type: "string" },
    primaryProblem: { type: "string" },
    commercialConsequence: { type: "string" },
    credibleOutcome: { type: "string" },
    entryProposition: { type: "string" },
    smallestReasonableCommitment: { type: "string" },
    likelyObjection: { type: "string" },
    objectionResponsePrinciple: { type: "string" },
    safeEvidence: {
      type: "array", maxItems: 16,
      items: { type: "object", additionalProperties: false, required: ["sourceType","sourceId","claim","usage"], properties: {
        sourceType: { type: "string", enum: ["BUSINESS_DNA","CAMPAIGN","COMPANY","CONTACT","ROUTE","OPPORTUNITY"] },
        sourceId: { type: "string" }, claim: { type: "string" }, usage: { type: "string" },
      } },
    },
    prohibitedClaims: { type: "array", maxItems: 16, items: { type: "string" } },
    commercialInferences: { type: "array", maxItems: 12, items: { type: "string" } },
    limitations: { type: "array", maxItems: 12, items: { type: "string" } },
    reasoningConfidence: { type: "integer", minimum: 0, maximum: 100 },
    reasoningSummary: { type: "string" },
  },
} as const;

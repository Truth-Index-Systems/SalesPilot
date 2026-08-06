import { z } from "zod";

const Score = z.number().int().min(0).max(100);
const EvidenceReference = z.object({
  evidenceType: z.enum(["COMPANY", "CONTACT", "OPPORTUNITY", "BUSINESS_DNA", "CAMPAIGN"]),
  sourceId: z.string().min(1).max(200),
  supportedClaim: z.string().min(1).max(500),
});

export const OutreachGenerationSchema = z.object({
  schemaVersion: z.literal("engagement-outreach-generation/v1"),
  promptVersion: z.literal("engagement-outreach-generation/v1"),
  subject: z.string().min(1).max(140),
  opening: z.string().min(1).max(500),
  personalisation: z.string().min(1).max(800),
  buyingAngle: z.string().min(1).max(500),
  primaryPain: z.string().min(1).max(500),
  valueProposition: z.string().min(1).max(800),
  supportingEvidence: z.array(EvidenceReference).max(12),
  callToAction: z.string().min(1).max(500),
  tone: z.enum(["EXECUTIVE", "CONSULTATIVE", "OPERATIONAL", "TECHNICAL", "DIRECT", "WARM"]),
  confidence: Score,
  reasoning: z.string().min(1).max(1500),
  limitations: z.array(z.string().min(1).max(300)).max(10),
});

export type OutreachGeneration = z.infer<typeof OutreachGenerationSchema>;

export const outreachGenerationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion", "promptVersion", "subject", "opening", "personalisation",
    "buyingAngle", "primaryPain", "valueProposition", "supportingEvidence",
    "callToAction", "tone", "confidence", "reasoning", "limitations",
  ],
  properties: {
    schemaVersion: { type: "string", enum: ["engagement-outreach-generation/v1"] },
    promptVersion: { type: "string", enum: ["engagement-outreach-generation/v1"] },
    subject: { type: "string" },
    opening: { type: "string" },
    personalisation: { type: "string" },
    buyingAngle: { type: "string" },
    primaryPain: { type: "string" },
    valueProposition: { type: "string" },
    supportingEvidence: {
      type: "array", maxItems: 12,
      items: {
        type: "object", additionalProperties: false,
        required: ["evidenceType", "sourceId", "supportedClaim"],
        properties: {
          evidenceType: { type: "string", enum: ["COMPANY", "CONTACT", "OPPORTUNITY", "BUSINESS_DNA", "CAMPAIGN"] },
          sourceId: { type: "string" },
          supportedClaim: { type: "string" },
        },
      },
    },
    callToAction: { type: "string" },
    tone: { type: "string", enum: ["EXECUTIVE", "CONSULTATIVE", "OPERATIONAL", "TECHNICAL", "DIRECT", "WARM"] },
    confidence: { type: "integer", minimum: 0, maximum: 100 },
    reasoning: { type: "string" },
    limitations: { type: "array", maxItems: 10, items: { type: "string" } },
  },
} as const;

import { z } from "zod";

const Score = z.number().int().min(0).max(100);
export const G5OutreachChannel = z.enum(["EMAIL", "LINKEDIN", "SWITCHBOARD", "REFERRAL"]);

const EvidenceUse = z.object({
  sourceId: z.string().min(1).max(200),
  supportedClaim: z.string().min(1).max(500),
});

const Content = z.object({
  subject: z.string().min(1).max(180).nullable(),
  emailBody: z.string().min(1).max(3000).nullable(),
  linkedinConnectionNote: z.string().min(1).max(500).nullable(),
  linkedinMessage: z.string().min(1).max(1600).nullable(),
  switchboardOpening: z.string().min(1).max(800).nullable(),
  switchboardRoutingRequest: z.string().min(1).max(800).nullable(),
  referralRequest: z.string().min(1).max(1200).nullable(),
  referralForwardableNote: z.string().min(1).max(1600).nullable(),
});

export const G5OutreachGenerationSchema = z.object({
  schemaVersion: z.literal("g5-outreach-generation/v1"),
  promptVersion: z.enum(["g5-outreach-generation/v1", "g5-outreach-generation/v2", "g5-outreach-generation/v3", "g5-outreach-generation/v4-executive-communications", "g5-outreach-generation/v5-responsibility-boundary"]),
  routeId: z.string().uuid(),
  channel: G5OutreachChannel,
  content: Content,
  personalisationBasis: z.array(z.string().min(1).max(500)).max(8),
  evidenceUsed: z.array(EvidenceUse).max(12),
  callToAction: z.string().min(1).max(500),
  tone: z.enum(["EXECUTIVE", "CONSULTATIVE", "OPERATIONAL", "DIRECT", "WARM"]),
  confidence: Score,
  generationRationale: z.string().min(1).max(1200),
  prohibitedClaimsObserved: z.array(z.string().min(1).max(500)).max(12),
  limitations: z.array(z.string().min(1).max(400)).max(10),
});

export type G5OutreachGeneration = z.infer<typeof G5OutreachGenerationSchema>;

const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] } as const;
export const g5OutreachGenerationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion", "promptVersion", "routeId", "channel", "content", "personalisationBasis",
    "evidenceUsed", "callToAction", "tone", "confidence", "generationRationale",
    "prohibitedClaimsObserved", "limitations",
  ],
  properties: {
    schemaVersion: { type: "string", enum: ["g5-outreach-generation/v1"] },
    promptVersion: { type: "string", enum: ["g5-outreach-generation/v5-responsibility-boundary"] },
    routeId: { type: "string" },
    channel: { type: "string", enum: ["EMAIL", "LINKEDIN", "SWITCHBOARD", "REFERRAL"] },
    content: {
      type: "object", additionalProperties: false,
      required: ["subject", "emailBody", "linkedinConnectionNote", "linkedinMessage", "switchboardOpening", "switchboardRoutingRequest", "referralRequest", "referralForwardableNote"],
      properties: {
        subject: nullableString,
        emailBody: nullableString,
        linkedinConnectionNote: nullableString,
        linkedinMessage: nullableString,
        switchboardOpening: nullableString,
        switchboardRoutingRequest: nullableString,
        referralRequest: nullableString,
        referralForwardableNote: nullableString,
      },
    },
    personalisationBasis: { type: "array", maxItems: 8, items: { type: "string" } },
    evidenceUsed: {
      type: "array", maxItems: 12,
      items: {
        type: "object", additionalProperties: false, required: ["sourceId", "supportedClaim"],
        properties: { sourceId: { type: "string" }, supportedClaim: { type: "string" } },
      },
    },
    callToAction: { type: "string" },
    tone: { type: "string", enum: ["EXECUTIVE", "CONSULTATIVE", "OPERATIONAL", "DIRECT", "WARM"] },
    confidence: { type: "integer", minimum: 0, maximum: 100 },
    generationRationale: { type: "string" },
    prohibitedClaimsObserved: { type: "array", maxItems: 12, items: { type: "string" } },
    limitations: { type: "array", maxItems: 10, items: { type: "string" } },
  },
} as const;

import { z } from "zod";

const ConfidenceSchema = z.number().min(0).max(1);
const EvidenceNoteSchema = z.object({
  claim: z.string().min(1),
  sourceUrl: z.string().url().nullable().optional(),
  excerpt: z.string().max(500).nullable().optional(),
});

export const CampaignProposalSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  objective: z.string().min(1),
  audience: z.string().min(1),
  buyerRoles: z.array(z.string().min(1)).min(1),
  messageAngle: z.string().min(1),
  recommendedMode: z.enum(["autopilot", "approval", "assisted"]),
  fitScore: z.number().int().min(0).max(100),
  confidence: ConfidenceSchema,
  why: z.array(z.string().min(1)).min(1),
  risks: z.array(z.string()),
});

export const BusinessDnaPayloadSchema = z.object({
  company: z.object({
    name: z.string().min(1),
    website: z.string().url(),
    summary: z.string().min(1),
    industry: z.string().min(1),
    businessModel: z.string().min(1),
    locations: z.array(z.string()),
  }),
  offers: z.array(z.object({
    name: z.string().min(1),
    description: z.string().min(1),
    confidence: ConfidenceSchema,
  })).min(1),
  idealCustomers: z.array(z.object({
    segment: z.string().min(1),
    industries: z.array(z.string()),
    companySize: z.string().min(1),
    geographies: z.array(z.string()),
    buyerRoles: z.array(z.string()).min(1),
    pains: z.array(z.string()).min(1),
    confidence: ConfidenceSchema,
  })).min(1),
  positioning: z.object({
    strongestValueProposition: z.string().min(1),
    differentiators: z.array(z.string()),
    proofPoints: z.array(z.string()),
    likelyObjections: z.array(z.string()),
    recommendedTone: z.array(z.string()).min(1),
    avoid: z.array(z.string()),
  }),
  campaigns: z.array(CampaignProposalSchema).min(1).max(5),
  evidenceNotes: z.array(EvidenceNoteSchema),
  unknowns: z.array(z.string()),
});

export type BusinessDnaPayload = z.infer<typeof BusinessDnaPayloadSchema>;
export type CampaignProposal = z.infer<typeof CampaignProposalSchema>;

export type BusinessDna = BusinessDnaPayload;

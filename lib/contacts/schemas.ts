import { z } from "zod";

export const ContactReviewStatusSchema = z.enum([
  "PENDING_REVIEW",
  "APPROVED",
  "REJECTED",
  "HOLD",
  "ARCHIVED",
]);

export const ContactConfidenceLabelSchema = z.enum([
  "VERIFIED",
  "LIKELY",
  "POSSIBLE",
  "UNKNOWN",
]);

export const ContactEvidenceTypeSchema = z.enum([
  "IDENTITY",
  "ROLE",
  "DEPARTMENT",
  "LOCATION",
  "BUYING_RELEVANCE",
  "OPERATIONAL_RELEVANCE",
]);

export const ContactSourceKindSchema = z.enum([
  "OFFICIAL_WEBSITE",
  "OFFICIAL_LINKEDIN_COMPANY",
  "PRESS_RELEASE",
  "REGULATORY_FILING",
  "PUBLISHED_STAFF_DIRECTORY",
]);

export const ContactEvidenceSchema = z.object({
  evidenceType: ContactEvidenceTypeSchema,
  claim: z.string().min(1).max(500),
  sourceUrl: z.string().url(),
  sourceTitle: z.string().max(240).optional().nullable(),
  excerpt: z.string().max(900).optional().nullable(),
  sourceKind: ContactSourceKindSchema,
  sourceDomain: z.string().max(255).optional().nullable(),
  verified: z.boolean(),
  excerptMatched: z.boolean(),
  qualityScore: z.number().int().min(0).max(100),
  retrievedAt: z.string().datetime().optional().nullable(),
});

export const ContactConfidenceSchema = z.object({
  identity: z.number().int().min(0).max(100),
  role: z.number().int().min(0).max(100),
  buyingRelevance: z.number().int().min(0).max(100),
  operationalRelevance: z.number().int().min(0).max(100),
  evidenceQuality: z.number().int().min(0).max(100),
  overall: z.number().int().min(0).max(100),
  label: ContactConfidenceLabelSchema,
});

export const DiscoveredContactSchema = z.object({
  fullName: z.string().min(1).max(180),
  roleTitle: z.string().min(1).max(180),
  department: z.string().max(180).optional().nullable(),
  location: z.string().max(180).optional().nullable(),
  reasonSelected: z.string().min(1).max(900),
  confidence: ContactConfidenceSchema,
  unknowns: z.array(z.string().min(1).max(400)).max(8),
  riskFlags: z.array(z.string().min(1).max(400)).max(8),
  evidence: z.array(ContactEvidenceSchema).min(1).max(12),
});

export const ContactDiscoveryResultSchema = z.object({
  schemaVersion: z.literal("contact-discovery/v1"),
  companyId: z.string().uuid(),
  researchSummary: z.string().min(1).max(900),
  contacts: z.array(DiscoveredContactSchema).max(20),
  unresolvedRoles: z.array(z.string().min(1).max(180)).max(20),
  uncertainties: z.array(z.string().min(1).max(500)).max(12),
});

export type ContactReviewStatus = z.infer<typeof ContactReviewStatusSchema>;
export type ContactConfidenceLabel = z.infer<typeof ContactConfidenceLabelSchema>;
export type ContactEvidence = z.infer<typeof ContactEvidenceSchema>;
export type ContactConfidence = z.infer<typeof ContactConfidenceSchema>;
export type DiscoveredContact = z.infer<typeof DiscoveredContactSchema>;
export type ContactDiscoveryResult = z.infer<typeof ContactDiscoveryResultSchema>;

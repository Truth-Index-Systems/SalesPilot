import { z } from "zod";

export const DiscoveryEvidenceSchema = z.object({
  claim: z.string().min(1).max(500),
  sourceUrl: z.string().url(),
  sourceTitle: z.string().max(200).optional().nullable(),
  excerpt: z.string().max(700).optional().nullable(),
});

export const DiscoveryFitBreakdownSchema = z.object({
  industryFit: z.number().int().min(0).max(100),
  audienceFit: z.number().int().min(0).max(100),
  operationalFit: z.number().int().min(0).max(100),
  geographyFit: z.number().int().min(0).max(100),
  commercialFit: z.number().int().min(0).max(100),
});

export const DiscoveredCompanySchema = z.object({
  name: z.string().min(1).max(180),
  websiteUrl: z.string().url(),
  country: z.string().max(120).optional().default(""),
  industry: z.string().max(180).optional().default(""),
  summary: z.string().min(1).max(900),
  confidence: z.number().int().min(0).max(100),
  matchLabel: z.enum(["Strongest match", "Strong match", "Good match"]),
  fitBreakdown: DiscoveryFitBreakdownSchema,
  why: z.array(z.string().min(1).max(400)).min(1).max(6),
  uncertainties: z.array(z.string().max(400)).max(6),
  riskFlags: z.array(z.string().max(300)).max(6),
  evidence: z.array(DiscoveryEvidenceSchema).min(1).max(8),
});

export const CompanyDiscoveryResultSchema = z.object({
  schemaVersion: z.literal("company-discovery/v2"),
  searchSummary: z.string().min(1).max(700),
  companies: z.array(DiscoveredCompanySchema).max(20),
});

export type DiscoveredCompany = z.infer<typeof DiscoveredCompanySchema>;
export type DiscoveryFitBreakdown = z.infer<typeof DiscoveryFitBreakdownSchema>;

export type VerifiedDiscoveryEvidence = z.infer<typeof DiscoveryEvidenceSchema> & {
  verified: boolean;
  excerptMatched: boolean;
  sourceDomain: string;
  retrievedAt: string | null;
};

export type VerifiedDiscoveredCompany = Omit<DiscoveredCompany, "evidence"> & {
  evidence: VerifiedDiscoveryEvidence[];
  evidenceQuality: number;
  verificationStatus: "VERIFIED";
};

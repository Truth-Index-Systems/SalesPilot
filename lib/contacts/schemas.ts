import { z } from "zod";

export const ContactReviewStatusSchema = z.enum(["PENDING_REVIEW","APPROVED","REJECTED","HOLD","ARCHIVED"]);
export const ContactConfidenceLabelSchema = z.enum(["VERIFIED","LIKELY","POSSIBLE","UNKNOWN"]);
export const ContactEmailStatusSchema = z.enum(["VERIFIED","LIKELY","UNKNOWN"]);
export const ContactLinkedInStatusSchema = z.enum(["VERIFIED","HIGH_CONFIDENCE","UNKNOWN"]);
export const ContactEvidenceTypeSchema = z.enum(["IDENTITY","ROLE","DEPARTMENT","LOCATION","BUYING_RELEVANCE","OPERATIONAL_RELEVANCE","EMAIL","LINKEDIN"]);
export const ContactSourceKindSchema = z.enum(["OFFICIAL_WEBSITE","OFFICIAL_LINKEDIN_COMPANY","OFFICIAL_LINKEDIN_PROFILE","PRESS_RELEASE","REGULATORY_FILING","PUBLISHED_STAFF_DIRECTORY"]);

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
  identity: z.number().int().min(0).max(100), role: z.number().int().min(0).max(100),
  buyingRelevance: z.number().int().min(0).max(100), operationalRelevance: z.number().int().min(0).max(100),
  evidenceQuality: z.number().int().min(0).max(100), overall: z.number().int().min(0).max(100),
  label: ContactConfidenceLabelSchema,
});

export const ContactEmailSchema = z.object({
  address: z.string().email().max(320).optional().nullable(),
  status: ContactEmailStatusSchema,
  confidence: z.number().int().min(0).max(100),
  sourceUrl: z.string().url().optional().nullable(),
  reason: z.string().min(1).max(500),
});

export const ContactLinkedInSchema = z.object({
  profileUrl: z.string().url().optional().nullable(),
  status: ContactLinkedInStatusSchema,
  confidence: z.number().int().min(0).max(100),
  sourceUrl: z.string().url().optional().nullable(),
  reason: z.string().min(1).max(500),
});

export const DiscoveredContactSchema = z.object({
  fullName: z.string().min(1).max(180), roleTitle: z.string().min(1).max(180),
  department: z.string().max(180).optional().nullable(), location: z.string().max(180).optional().nullable(),
  reasonSelected: z.string().min(1).max(900), confidence: ContactConfidenceSchema,
  email: ContactEmailSchema, linkedin: ContactLinkedInSchema,
  unknowns: z.array(z.string().min(1).max(400)).max(8), riskFlags: z.array(z.string().min(1).max(400)).max(8),
  evidence: z.array(ContactEvidenceSchema).min(1).max(14),
});

export const CompanyContactChannelSchema = z.object({
  emailAddress: z.string().email().max(320),
  channelType: z.enum(["NAMED", "DEPARTMENTAL", "GENERAL"]),
  department: z.string().max(180).optional().nullable(),
  associatedContactName: z.string().max(180).optional().nullable(),
  likelyReader: z.string().min(1).max(300),
  reasonSelected: z.string().min(1).max(600),
  verificationStatus: z.enum(["PUBLIC_VERIFIED", "PATTERN_LIKELY"]),
  confidence: z.number().int().min(0).max(100),
  routingScore: z.number().int().min(0).max(100),
  responseLikelihood: z.number().int().min(0).max(100),
  campaignRelevance: z.number().int().min(0).max(100),
  sourceUrl: z.string().url(),
  sourceTitle: z.string().max(240).optional().nullable(),
  evidenceExcerpt: z.string().min(1).max(900),
});


export const RouteTypeSchema = z.enum(["PRIMARY","OPERATIONAL","TRANSFORMATION","PROCUREMENT","TECHNICAL","EXECUTIVE","REGIONAL","FALLBACK"]);
export const RouteChannelTypeSchema = z.enum(["DIRECT_EMAIL","LINKEDIN","DEPARTMENT_EMAIL","GENERAL_EMAIL","SWITCHBOARD","INTRODUCTION","UNKNOWN"]);
export const RouteDifficultySchema = z.enum(["LOW","MEDIUM","HIGH"]);

export const OrganisationMapSchema = z.object({
  summary: z.string().min(1).max(1200),
  departments: z.array(z.string().min(1).max(180)).max(24),
  businessUnits: z.array(z.string().min(1).max(180)).max(24),
  buyingCentres: z.array(z.string().min(1).max(180)).max(20),
  hierarchy: z.array(z.string().min(1).max(300)).max(24),
  ownershipSignals: z.array(z.string().min(1).max(400)).max(20),
});

export const BuyingPathSchema = z.object({
  name: z.string().min(1).max(180),
  routeType: RouteTypeSchema,
  objective: z.string().min(1).max(500),
  entryRole: z.string().min(1).max(180),
  targetRole: z.string().min(1).max(180),
  steps: z.array(z.string().min(1).max(180)).min(1).max(10),
  rationale: z.string().min(1).max(900),
  confidence: z.number().int().min(0).max(100),
});

export const CommercialRouteSchema = z.object({
  routeKey: z.string().min(1).max(120),
  routeType: RouteTypeSchema,
  label: z.string().min(1).max(180),
  entryRole: z.string().min(1).max(180),
  targetRole: z.string().min(1).max(180),
  department: z.string().max(180).optional().nullable(),
  contactName: z.string().max(180).optional().nullable(),
  contactRole: z.string().max(180).optional().nullable(),
  channelType: RouteChannelTypeSchema,
  channelValue: z.string().max(500).optional().nullable(),
  rationale: z.string().min(1).max(1200),
  nextStep: z.string().min(1).max(900),
  fallbackReason: z.string().max(700).optional().nullable(),
  evidence: z.array(ContactEvidenceSchema).max(12),
});

export const ContactDiscoveryResultSchema = z.object({
  schemaVersion: z.literal("contact-discovery/v3"), companyId: z.string().uuid(),
  researchSummary: z.string().min(1).max(900), organisationMap: OrganisationMapSchema,
  buyingPaths: z.array(BuyingPathSchema).max(12), routes: z.array(CommercialRouteSchema).max(16),
  contacts: z.array(DiscoveredContactSchema).max(20),
  companyContactChannels: z.array(CompanyContactChannelSchema).max(30),
  unresolvedRoles: z.array(z.string().min(1).max(180)).max(20), uncertainties: z.array(z.string().min(1).max(500)).max(12),
});

export type ContactReviewStatus = z.infer<typeof ContactReviewStatusSchema>;
export type ContactConfidenceLabel = z.infer<typeof ContactConfidenceLabelSchema>;
export type ContactEmailStatus = z.infer<typeof ContactEmailStatusSchema>;
export type ContactLinkedInStatus = z.infer<typeof ContactLinkedInStatusSchema>;
export type ContactEvidence = z.infer<typeof ContactEvidenceSchema>;
export type ContactConfidence = z.infer<typeof ContactConfidenceSchema>;
export type DiscoveredContact = z.infer<typeof DiscoveredContactSchema>;
export type CompanyContactChannel = z.infer<typeof CompanyContactChannelSchema>;
export type ContactDiscoveryResult = z.infer<typeof ContactDiscoveryResultSchema>;

export type OrganisationMap = z.infer<typeof OrganisationMapSchema>;
export type BuyingPath = z.infer<typeof BuyingPathSchema>;
export type CommercialRoute = z.infer<typeof CommercialRouteSchema>;

import { z } from "zod";

export const G5PersonalisationClassification = z.enum(["VERIFIED_FACT", "COMMERCIAL_INFERENCE", "DO_NOT_USE"]);

const ManifestItem = z.object({
  itemId: z.string().min(1).max(240),
  classification: G5PersonalisationClassification,
  statement: z.string().min(1).max(700),
  sourceType: z.enum(["BUSINESS_DNA", "CAMPAIGN", "COMPANY", "CONTACT", "ROUTE", "OPPORTUNITY", "REASONING"]).nullable(),
  sourceId: z.string().min(1).max(240).nullable(),
  allowedUsage: z.enum(["DIRECT_REFERENCE", "FRAMED_INFERENCE", "EXCLUDE"]),
  usageGuidance: z.string().min(1).max(700),
});

export const G5PersonalisationSafetySchema = z.object({
  schemaVersion: z.literal("g5-personalisation-safety/v1"),
  policyVersion: z.literal("g5-personalisation-safety/v1"),
  items: z.array(ManifestItem).max(64),
  verifiedFactIds: z.array(z.string().min(1).max(240)).max(32),
  commercialInferenceIds: z.array(z.string().min(1).max(240)).max(24),
  doNotUseIds: z.array(z.string().min(1).max(240)).max(24),
  immutableG4: z.literal(true),
});

export type G5PersonalisationSafety = z.infer<typeof G5PersonalisationSafetySchema>;

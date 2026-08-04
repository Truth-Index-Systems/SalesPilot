import { z } from "zod";
export const EvidenceReferenceSchema = z.object({
  sourceType: z.enum(["website", "document", "provider", "user", "system"]),
  sourceId: z.string(),
  url: z.string().url().nullable().optional(),
  excerpt: z.string().max(800).nullable().optional(),
  observedAt: z.string().datetime(),
  freshness: z.enum(["current", "recent", "stale", "unknown"])
});
export const AiEnvelopeSchema = <T extends z.ZodTypeAny>(payload: T) => z.object({
  schemaVersion: z.string().min(1),
  promptVersion: z.string().min(1),
  model: z.string().min(1),
  generatedAt: z.string().datetime(),
  confidence: z.number().min(0).max(1),
  warnings: z.array(z.string()),
  evidence: z.array(EvidenceReferenceSchema),
  payload
});
export type EvidenceReference = z.infer<typeof EvidenceReferenceSchema>;
export type AiEnvelope<T> = {
  schemaVersion: string; promptVersion: string; model: string; generatedAt: string;
  confidence: number; warnings: string[]; evidence: EvidenceReference[]; payload: T;
};

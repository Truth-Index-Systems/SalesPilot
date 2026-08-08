import { z } from "zod";
import { AiEnvelopeSchema, type AiEnvelope, type EvidenceReference } from "@/lib/ai/contracts";
import { CampaignProposalSchema, BusinessDnaPayloadSchema, type BusinessDnaPayload } from "@/lib/ai/schemas/business-dna";
import { normaliseBusinessDnaPayload } from "@/lib/intelligence/fit-score";

const ConfidenceSchema = z.number().min(0).max(1);
const EvidenceNoteSchema = z.object({
  claim: z.string().min(1),
  sourceUrl: z.string().url().nullable(),
  excerpt: z.string().max(500).nullable(),
});

export const CoreBusinessDnaPayloadSchema = z.object({
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
  positioningCore: z.object({
    strongestValueProposition: z.string().min(1),
    differentiators: z.array(z.string()),
    proofPoints: z.array(z.string()),
  }),
  evidenceNotes: z.array(EvidenceNoteSchema),
  unknowns: z.array(z.string()),
});

export const CoreBusinessDnaEnvelopeSchema = AiEnvelopeSchema(CoreBusinessDnaPayloadSchema);
export type CoreBusinessDnaEnvelope = z.infer<typeof CoreBusinessDnaEnvelopeSchema>;

export const GrowthStrategyPayloadSchema = z.object({
  idealCustomers: z.array(z.object({
    segment: z.string().min(1),
    industries: z.array(z.string()),
    companySize: z.string().min(1),
    geographies: z.array(z.string()),
    buyerRoles: z.array(z.string()).min(1),
    pains: z.array(z.string()).min(1),
    confidence: ConfidenceSchema,
  })).min(1),
  positioningGrowth: z.object({
    likelyObjections: z.array(z.string()),
    recommendedTone: z.array(z.string()).min(1),
    avoid: z.array(z.string()),
  }),
  campaigns: z.array(CampaignProposalSchema).min(1).max(5),
  unknowns: z.array(z.string()),
});

export const GrowthStrategyEnvelopeSchema = AiEnvelopeSchema(GrowthStrategyPayloadSchema);
export type GrowthStrategyEnvelope = z.infer<typeof GrowthStrategyEnvelopeSchema>;

const evidenceReferenceJsonSchema = {
  type: "object", additionalProperties: false,
  required: ["sourceType", "sourceId", "url", "excerpt", "observedAt", "freshness"],
  properties: {
    sourceType: { type: "string", enum: ["website", "document", "provider", "user", "system"] },
    sourceId: { type: "string" },
    url: { type: ["string", "null"] },
    excerpt: { type: ["string", "null"] },
    observedAt: { type: "string" },
    freshness: { type: "string", enum: ["current", "recent", "stale", "unknown"] },
  },
} as const;

const envelopeProperties = {
  schemaVersion: { type: "string" }, promptVersion: { type: "string" }, model: { type: "string" }, generatedAt: { type: "string" },
  confidence: { type: "number", minimum: 0, maximum: 1 }, warnings: { type: "array", items: { type: "string" } },
  evidence: { type: "array", items: evidenceReferenceJsonSchema },
} as const;

export const coreBusinessDnaJsonSchema = {
  type: "object", additionalProperties: false,
  required: ["schemaVersion", "promptVersion", "model", "generatedAt", "confidence", "warnings", "evidence", "payload"],
  properties: {
    ...envelopeProperties,
    payload: {
      type: "object", additionalProperties: false,
      required: ["company", "offers", "positioningCore", "evidenceNotes", "unknowns"],
      properties: {
        company: { type: "object", additionalProperties: false, required: ["name", "website", "summary", "industry", "businessModel", "locations"], properties: {
          name:{type:"string"},website:{type:"string"},summary:{type:"string"},industry:{type:"string"},businessModel:{type:"string"},locations:{type:"array",items:{type:"string"}},
        }},
        offers: { type:"array", minItems:1, items:{type:"object",additionalProperties:false,required:["name","description","confidence"],properties:{name:{type:"string"},description:{type:"string"},confidence:{type:"number",minimum:0,maximum:1}}}},
        positioningCore: { type:"object",additionalProperties:false,required:["strongestValueProposition","differentiators","proofPoints"],properties:{strongestValueProposition:{type:"string"},differentiators:{type:"array",items:{type:"string"}},proofPoints:{type:"array",items:{type:"string"}}}},
        evidenceNotes: { type:"array",items:{type:"object",additionalProperties:false,required:["claim","sourceUrl","excerpt"],properties:{claim:{type:"string"},sourceUrl:{type:["string","null"]},excerpt:{type:["string","null"]}}}},
        unknowns:{type:"array",items:{type:"string"}},
      },
    },
  },
} as const;

const campaignJsonSchema = { type:"object",additionalProperties:false,required:["id","name","objective","audience","buyerRoles","messageAngle","recommendedMode","fitScore","confidence","why","risks"],properties:{
  id:{type:"string"},name:{type:"string"},objective:{type:"string"},audience:{type:"string"},buyerRoles:{type:"array",minItems:1,items:{type:"string"}},messageAngle:{type:"string"},recommendedMode:{type:"string",enum:["autopilot","approval","assisted"]},fitScore:{type:"integer",minimum:0,maximum:100},confidence:{type:"number",minimum:0,maximum:1},why:{type:"array",minItems:1,items:{type:"string"}},risks:{type:"array",items:{type:"string"}},
}} as const;

export const growthStrategyJsonSchema = {
  type:"object",additionalProperties:false,
  required:["schemaVersion","promptVersion","model","generatedAt","confidence","warnings","evidence","payload"],
  properties:{
    ...envelopeProperties,
    payload:{type:"object",additionalProperties:false,required:["idealCustomers","positioningGrowth","campaigns","unknowns"],properties:{
      idealCustomers:{type:"array",minItems:1,items:{type:"object",additionalProperties:false,required:["segment","industries","companySize","geographies","buyerRoles","pains","confidence"],properties:{segment:{type:"string"},industries:{type:"array",items:{type:"string"}},companySize:{type:"string"},geographies:{type:"array",items:{type:"string"}},buyerRoles:{type:"array",minItems:1,items:{type:"string"}},pains:{type:"array",minItems:1,items:{type:"string"}},confidence:{type:"number",minimum:0,maximum:1}}}},
      positioningGrowth:{type:"object",additionalProperties:false,required:["likelyObjections","recommendedTone","avoid"],properties:{likelyObjections:{type:"array",items:{type:"string"}},recommendedTone:{type:"array",minItems:1,items:{type:"string"}},avoid:{type:"array",items:{type:"string"}}}},
      campaigns:{type:"array",minItems:1,maxItems:5,items:campaignJsonSchema},
      unknowns:{type:"array",items:{type:"string"}},
    }},
  },
} as const;

function dedupeEvidence(items: EvidenceReference[]) {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = `${item.sourceType}:${item.sourceId}:${item.url ?? ""}:${item.excerpt ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, 30);
}

export function assembleBusinessAnalysis(core: CoreBusinessDnaEnvelope, growth: GrowthStrategyEnvelope): AiEnvelope<BusinessDnaPayload> {
  const payload = normaliseBusinessDnaPayload(BusinessDnaPayloadSchema.parse({
    company: core.payload.company,
    offers: core.payload.offers,
    idealCustomers: growth.payload.idealCustomers,
    positioning: {
      strongestValueProposition: core.payload.positioningCore.strongestValueProposition,
      differentiators: core.payload.positioningCore.differentiators,
      proofPoints: core.payload.positioningCore.proofPoints,
      likelyObjections: growth.payload.positioningGrowth.likelyObjections,
      recommendedTone: growth.payload.positioningGrowth.recommendedTone,
      avoid: growth.payload.positioningGrowth.avoid,
    },
    campaigns: growth.payload.campaigns,
    evidenceNotes: core.payload.evidenceNotes,
    unknowns: Array.from(new Set([...core.payload.unknowns, ...growth.payload.unknowns])).slice(0, 30),
  }));
  return {
    schemaVersion: "business-dna/v1",
    promptVersion: "business-discovery/v4-decomposed",
    model: growth.model || core.model,
    generatedAt: growth.generatedAt,
    confidence: Math.max(0, Math.min(1, (core.confidence * 0.55) + (growth.confidence * 0.45))),
    warnings: Array.from(new Set([...core.warnings, ...growth.warnings])).slice(0, 30),
    evidence: dedupeEvidence([...core.evidence, ...growth.evidence]),
    payload,
  };
}

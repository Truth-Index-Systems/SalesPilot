import { z } from "zod";
import type { GenesisG8EntityType as TruthEntityType } from "../../entity-types";
import { getMrTi2ClaimContract } from "../contracts";

export const MrTi2EvidenceDirectionSchema = z.enum(["SUPPORT","CONTRADICT"]);
export const MrTi2RelationshipTypeSchema = z.enum(["DEPENDS_ON","CONTRADICTS"]);
export const MrTi2SourceClassSchema = z.enum([
  "REGULATORY_OR_GOVERNMENT","OFFICIAL_PRIMARY","OFFICIAL_PROFILE","MAJOR_REPUTABLE_MEDIA","INDUSTRY_PUBLICATION",
  "COMMERCIAL_DATABASE","BUSINESS_DIRECTORY","SOCIAL_OR_COMMUNITY","SEARCH_SNIPPET","UNKNOWN",
]);
const UnitInterval = z.number().min(0).max(1);

export const MrTi2RelationshipHintSchema = z.object({
  type: MrTi2RelationshipTypeSchema,
  targetClaimKey: z.string().min(1).max(80),
  strength: UnitInterval,
  rationale: z.string().min(1).max(500),
});

export const MrTi2EvidenceObservationSchema = z.object({
  claimKey: z.string().min(1).max(80),
  direction: MrTi2EvidenceDirectionSchema,
  proposition: z.string().min(1).max(500),
  evidenceText: z.string().min(1).max(1200),
  sourceUrl: z.string().url(),
  sourceTitle: z.string().max(300).nullable(),
  sourceClass: MrTi2SourceClassSchema,
  authority: UnitInterval,
  directness: UnitInterval,
  traceability: UnitInterval,
  sourcePublishedAt: z.string().datetime({offset:true}).nullable(),
  observedAt: z.string().datetime({offset:true}),
  sourceLineageKey: z.string().min(1).max(240),
  derivativeOfLineageKey: z.string().min(1).max(240).nullable(),
  derivativeDepth: z.number().int().min(0).max(20),
  relationshipHints: z.array(MrTi2RelationshipHintSchema).max(12),
});

export const MrTi2EvidenceBatchSchema = z.object({
  engineContract: z.literal("MR-TI-2.0"),
  entityType: z.enum(["industry","sector","company","contact","route","opportunity"]),
  observations: z.array(MrTi2EvidenceObservationSchema).max(100),
  missingClaimKeys: z.array(z.string().min(1).max(80)).max(100),
});

export type MrTi2EvidenceObservation = z.infer<typeof MrTi2EvidenceObservationSchema>;
export type MrTi2EvidenceBatch = z.infer<typeof MrTi2EvidenceBatchSchema>;

export function validateMrTi2EvidenceBatch(entityType:TruthEntityType,value:unknown):MrTi2EvidenceBatch {
  const parsed=MrTi2EvidenceBatchSchema.parse(value);
  if(parsed.entityType!==entityType) throw new Error(`MR_TI_2_ENTITY_TYPE_MISMATCH:${parsed.entityType}:${entityType}`);
  const contract=getMrTi2ClaimContract(entityType);
  const allowed=new Set(contract.claims.map((claim)=>claim.key));
  for(const observation of parsed.observations){
    if(!allowed.has(observation.claimKey)) throw new Error(`MR_TI_2_UNKNOWN_CLAIM_KEY:${entityType}:${observation.claimKey}`);
    if(observation.derivativeDepth===0 && observation.derivativeOfLineageKey!==null) throw new Error(`MR_TI_2_LINEAGE_ROOT_HAS_PARENT:${observation.sourceLineageKey}`);
    if(observation.derivativeDepth>0 && observation.derivativeOfLineageKey===null) throw new Error(`MR_TI_2_DERIVATIVE_MISSING_PARENT:${observation.sourceLineageKey}`);
    for(const relationship of observation.relationshipHints){
      if(!allowed.has(relationship.targetClaimKey)) throw new Error(`MR_TI_2_UNKNOWN_RELATIONSHIP_TARGET:${entityType}:${relationship.targetClaimKey}`);
      if(relationship.targetClaimKey===observation.claimKey) throw new Error(`MR_TI_2_SELF_RELATIONSHIP:${observation.claimKey}`);
    }
  }
  for(const key of parsed.missingClaimKeys){ if(!allowed.has(key)) throw new Error(`MR_TI_2_UNKNOWN_MISSING_CLAIM_KEY:${entityType}:${key}`); }
  return parsed;
}

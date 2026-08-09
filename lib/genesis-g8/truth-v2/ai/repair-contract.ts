import { z } from "zod";
import type { TruthEntityType } from "../../truth/types";
import { buildMrTi2EvidenceCollectorInstructions } from "./prompt";
import { MrTi2EvidenceObservationSchema, validateMrTi2EvidenceBatch } from "./evidence-contract";

export const MR_TI_2_REPAIR_PROMPT_VERSION = "mr-ti-2/claim-repair/1.0" as const;

export const MrTi2ClaimRepairResultSchema = z.object({
  engineContract: z.literal("MR-TI-2.0"),
  entityType: z.enum(["industry","sector","company","contact","route","opportunity"]),
  claimKey: z.string().min(1).max(80),
  summary: z.string().max(800),
  observations: z.array(MrTi2EvidenceObservationSchema).max(8),
  missing: z.boolean(),
});

export type MrTi2ClaimRepairResult = z.infer<typeof MrTi2ClaimRepairResultSchema>;

export const mrTi2ClaimRepairJsonSchema = {
  type:"object", additionalProperties:false,
  required:["engineContract","entityType","claimKey","summary","observations","missing"],
  properties:{
    engineContract:{type:"string",enum:["MR-TI-2.0"]},
    entityType:{type:"string",enum:["industry","sector","company","contact","route","opportunity"]},
    claimKey:{type:"string",minLength:1,maxLength:80},
    summary:{type:"string",maxLength:800},
    observations:{type:"array",maxItems:8,items:{
      type:"object", additionalProperties:false,
      required:["claimKey","direction","proposition","evidenceText","sourceUrl","sourceTitle","sourceClass","authority","directness","traceability","sourcePublishedAt","observedAt","sourceLineageKey","derivativeOfLineageKey","derivativeDepth","relationshipHints"],
      properties:{
        claimKey:{type:"string",minLength:1,maxLength:80}, direction:{type:"string",enum:["SUPPORT","CONTRADICT"]},
        proposition:{type:"string",minLength:1,maxLength:500}, evidenceText:{type:"string",minLength:1,maxLength:1200},
        sourceUrl:{type:"string",format:"uri"}, sourceTitle:{type:["string","null"],maxLength:300},
        sourceClass:{type:"string",enum:["REGULATORY_OR_GOVERNMENT","OFFICIAL_PRIMARY","OFFICIAL_PROFILE","MAJOR_REPUTABLE_MEDIA","INDUSTRY_PUBLICATION","COMMERCIAL_DATABASE","BUSINESS_DIRECTORY","SOCIAL_OR_COMMUNITY","SEARCH_SNIPPET","UNKNOWN"]},
        authority:{type:"number",minimum:0,maximum:1}, directness:{type:"number",minimum:0,maximum:1}, traceability:{type:"number",minimum:0,maximum:1},
        sourcePublishedAt:{type:["string","null"]}, observedAt:{type:"string"}, sourceLineageKey:{type:"string",minLength:1,maxLength:240},
        derivativeOfLineageKey:{type:["string","null"],minLength:1,maxLength:240}, derivativeDepth:{type:"integer",minimum:0,maximum:20},
        relationshipHints:{type:"array",maxItems:12,items:{type:"object",additionalProperties:false,required:["type","targetClaimKey","strength","rationale"],properties:{
          type:{type:"string",enum:["DEPENDS_ON","CONTRADICTS"]}, targetClaimKey:{type:"string",minLength:1,maxLength:80}, strength:{type:"number",minimum:0,maximum:1}, rationale:{type:"string",minLength:1,maxLength:500},
        }}},
      },
    }},
    missing:{type:"boolean"},
  },
} as const;

export function buildMrTi2ClaimRepairInstructions(entityType:TruthEntityType, claimKey:string):string {
  return [
    buildMrTi2EvidenceCollectorInstructions(entityType),
    `REPAIR SCOPE: Research exactly one claim: ${claimKey}. Do not return observations for any other claim.`,
    "FALSIFICATION: Search as seriously for contradictory evidence as supporting evidence.",
    "MISSING RESULT: If no traceable evidence exists after reasonable search, set missing=true and observations=[]. Do not create low-confidence filler.",
    "RELATIONSHIP HINTS: You may identify evidence-supported DEPENDS_ON or CONTRADICTS links to other claims in the same contract, but do not calculate their effect.",
    `PROMPT POLICY: ${MR_TI_2_REPAIR_PROMPT_VERSION}.`,
  ].join("\n\n");
}

export function validateMrTi2ClaimRepairResult(entityType:TruthEntityType, claimKey:string, value:unknown):MrTi2ClaimRepairResult {
  const parsed=MrTi2ClaimRepairResultSchema.parse(value);
  if(parsed.entityType!==entityType) throw new Error(`MR_TI_2_REPAIR_ENTITY_TYPE_MISMATCH:${parsed.entityType}:${entityType}`);
  if(parsed.claimKey!==claimKey) throw new Error(`MR_TI_2_REPAIR_CLAIM_KEY_MISMATCH:${parsed.claimKey}:${claimKey}`);
  if(parsed.missing!== (parsed.observations.length===0)) throw new Error(`MR_TI_2_REPAIR_MISSINGNESS_MISMATCH:${claimKey}`);
  validateMrTi2EvidenceBatch(entityType,{engineContract:"MR-TI-2.0",entityType,observations:parsed.observations,missingClaimKeys:parsed.missing?[claimKey]:[]});
  for(const observation of parsed.observations){ if(observation.claimKey!==claimKey) throw new Error(`MR_TI_2_REPAIR_CROSS_CLAIM_OBSERVATION:${observation.claimKey}:${claimKey}`); }
  return parsed;
}

import { assertOpenAiStrictJsonSchema } from "@/lib/ai/strict-json-schema";
import type { GenesisG8EntityType as TruthEntityType } from "../../entity-types";
import { buildMrTi2EvidenceCollectorInstructions } from "./prompt";
import type { MrTi2EvidenceObservation } from "./evidence-contract";
import { getMrTi2ClaimContract } from "../contracts";
import type { HardAcceptance } from "../../ai-canonicalisation";

export const MR_TI_2_REPAIR_PROMPT_VERSION = "mr-ti-2/claim-repair/1.2-ai-canonicalisation" as const;

export type MrTi2ClaimRepairResult = {
  engineContract:"MR-TI-2.0";
  entityType:TruthEntityType;
  claimKey:string;
  summary:string;
  observations:MrTi2EvidenceObservation[];
  missing:boolean;
};

export const mrTi2ClaimRepairJsonSchema = {
  type:"object", additionalProperties:false,
  required:["engineContract","entityType","claimKey","summary","observations","missing"],
  properties:{
    engineContract:{type:"string",enum:["MR-TI-2.0"]},
    entityType:{type:"string",enum:["industry","sector","company","contact","route","opportunity"]},
    claimKey:{type:"string"},
    summary:{type:"string"},
    observations:{type:"array",maxItems:8,items:{
      type:"object", additionalProperties:false,
      required:["claimKey","direction","proposition","evidenceText","sourceUrl","sourceTitle","sourceClass","authority","directness","traceability","sourcePublishedAt","observedAt","sourceLineageKey","derivativeOfLineageKey","derivativeDepth","relationshipHints"],
      properties:{
        claimKey:{type:"string"}, direction:{type:"string",enum:["SUPPORT","CONTRADICT"]},
        proposition:{type:"string"}, evidenceText:{type:"string"},
        sourceUrl:{type:"string"}, sourceTitle:{type:["string","null"]},
        sourceClass:{type:"string",enum:["REGULATORY_OR_GOVERNMENT","OFFICIAL_PRIMARY","OFFICIAL_PROFILE","MAJOR_REPUTABLE_MEDIA","INDUSTRY_PUBLICATION","COMMERCIAL_DATABASE","BUSINESS_DIRECTORY","SOCIAL_OR_COMMUNITY","SEARCH_SNIPPET","UNKNOWN"]},
        authority:{type:"number",minimum:0,maximum:1}, directness:{type:"number",minimum:0,maximum:1}, traceability:{type:"number",minimum:0,maximum:1},
        sourcePublishedAt:{type:["string","null"]}, observedAt:{type:"string"}, sourceLineageKey:{type:"string"},
        derivativeOfLineageKey:{type:["string","null"]}, derivativeDepth:{type:"integer",minimum:0,maximum:20},
        relationshipHints:{type:"array",maxItems:12,items:{type:"object",additionalProperties:false,required:["type","targetClaimKey","strength","rationale"],properties:{
          type:{type:"string",enum:["DEPENDS_ON","CONTRADICTS"]}, targetClaimKey:{type:"string"}, strength:{type:"number",minimum:0,maximum:1}, rationale:{type:"string"},
        }}},
      },
    }},
    missing:{type:"boolean"},
  },
} as const;

assertOpenAiStrictJsonSchema(mrTi2ClaimRepairJsonSchema, "mr_ti_2_claim_repair_v1");

const SOURCE_CLASSES=new Set(["REGULATORY_OR_GOVERNMENT","OFFICIAL_PRIMARY","OFFICIAL_PROFILE","MAJOR_REPUTABLE_MEDIA","INDUSTRY_PUBLICATION","COMMERCIAL_DATABASE","BUSINESS_DIRECTORY","SOCIAL_OR_COMMUNITY","SEARCH_SNIPPET","UNKNOWN"]);
function rec(v:unknown):Record<string,unknown>|null{return v!==null&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:null;}
function str(v:unknown,max:number):string|null{return typeof v==="string"&&v.length>0&&v.length<=max?v:null;}
function nullableStr(v:unknown,max:number):string|null|undefined{return v===null?null:str(v,max)??undefined;}
function unit(v:unknown):number|null{return typeof v==="number"&&Number.isFinite(v)&&v>=0&&v<=1?v:null;}
function integer(v:unknown,min:number,max:number):number|null{return typeof v==="number"&&Number.isInteger(v)&&v>=min&&v<=max?v:null;}
function url(v:unknown):v is string{if(typeof v!=="string"||!v)return false;try{const u=new URL(v);return u.protocol==="http:"||u.protocol==="https:";}catch{return false;}}
function entityType(v:unknown):TruthEntityType|null{return v==="industry"||v==="sector"||v==="company"||v==="contact"||v==="route"||v==="opportunity"?v:null;}

function acceptObservation(value:unknown,path:string,claimKey:string,allowed:Set<string>,issues:string[]):MrTi2EvidenceObservation|null{
  const row=rec(value);if(!row){issues.push(`${path}:object`);return null;}
  const direction=row.direction==="SUPPORT"||row.direction==="CONTRADICT"?row.direction:null;
  const proposition=str(row.proposition,500), evidenceText=str(row.evidenceText,1200), sourceTitle=nullableStr(row.sourceTitle,300), sourceLineageKey=str(row.sourceLineageKey,240), derivativeOfLineageKey=nullableStr(row.derivativeOfLineageKey,240);
  const authority=unit(row.authority),directness=unit(row.directness),traceability=unit(row.traceability),derivativeDepth=integer(row.derivativeDepth,0,20);
  const sourcePublishedAt=row.sourcePublishedAt===null?null:typeof row.sourcePublishedAt==="string"?row.sourcePublishedAt:undefined; const observedAt=typeof row.observedAt==="string"&&row.observedAt.length>0?row.observedAt:null;
  const sourceClass=typeof row.sourceClass==="string"&&SOURCE_CLASSES.has(row.sourceClass)?row.sourceClass as MrTi2EvidenceObservation["sourceClass"]:null;
  if(row.claimKey!==claimKey)issues.push(`${path}.claimKey`);if(!direction)issues.push(`${path}.direction`);if(!proposition)issues.push(`${path}.proposition`);if(!evidenceText)issues.push(`${path}.evidenceText`);if(!url(row.sourceUrl))issues.push(`${path}.sourceUrl`);if(sourceTitle===undefined)issues.push(`${path}.sourceTitle`);if(!sourceClass)issues.push(`${path}.sourceClass`);if(authority===null)issues.push(`${path}.authority`);if(directness===null)issues.push(`${path}.directness`);if(traceability===null)issues.push(`${path}.traceability`);if(sourcePublishedAt===undefined)issues.push(`${path}.sourcePublishedAt`);if(!observedAt)issues.push(`${path}.observedAt`);if(!sourceLineageKey)issues.push(`${path}.sourceLineageKey`);if(derivativeOfLineageKey===undefined)issues.push(`${path}.derivativeOfLineageKey`);if(derivativeDepth===null)issues.push(`${path}.derivativeDepth`);
  if(derivativeDepth===0&&derivativeOfLineageKey!==null&&derivativeOfLineageKey!==undefined)issues.push(`${path}.lineageRootParent`);if(derivativeDepth!==null&&derivativeDepth>0&&derivativeOfLineageKey===null)issues.push(`${path}.lineageMissingParent`);
  const relationshipHints:MrTi2EvidenceObservation["relationshipHints"]=[]; if(Array.isArray(row.relationshipHints))for(const [i,h] of row.relationshipHints.slice(0,12).entries()){const x=rec(h);if(!x){issues.push(`${path}.relationshipHints[${i}]`);continue;}const type=x.type==="DEPENDS_ON"||x.type==="CONTRADICTS"?x.type:null,targetClaimKey=str(x.targetClaimKey,80),strength=unit(x.strength),rationale=str(x.rationale,500);if(type&&targetClaimKey&&allowed.has(targetClaimKey)&&targetClaimKey!==claimKey&&strength!==null&&rationale)relationshipHints.push({type,targetClaimKey,strength,rationale});else issues.push(`${path}.relationshipHints[${i}]`);}
  if(row.claimKey!==claimKey||!direction||!proposition||!evidenceText||!url(row.sourceUrl)||sourceTitle===undefined||!sourceClass||authority===null||directness===null||traceability===null||sourcePublishedAt===undefined||!observedAt||!sourceLineageKey||derivativeOfLineageKey===undefined||derivativeDepth===null||(derivativeDepth===0&&derivativeOfLineageKey!==null)||(derivativeDepth>0&&derivativeOfLineageKey===null))return null;
  return {claimKey,direction,proposition,evidenceText,sourceUrl:row.sourceUrl,sourceTitle,sourceClass,authority,directness,traceability,sourcePublishedAt,observedAt,sourceLineageKey,derivativeOfLineageKey,derivativeDepth,relationshipHints};
}

/** Hard invariants only. No alias mapping, coercion, score scaling or semantic repair. */
export function hardAcceptMrTi2ClaimRepairResult(expectedEntityType:TruthEntityType,expectedClaimKey:string,value:unknown):HardAcceptance<MrTi2ClaimRepairResult>{
  const issues:string[]=[];const root=rec(value);if(!root)return {value:null,issues:["root:object"]};const actualType=entityType(root.entityType);if(root.engineContract!=="MR-TI-2.0")issues.push("engineContract");if(actualType!==expectedEntityType)issues.push("entityType");if(root.claimKey!==expectedClaimKey)issues.push("claimKey");const summary=typeof root.summary==="string"&&root.summary.length<=800?root.summary:null;if(summary===null)issues.push("summary");if(typeof root.missing!=="boolean")issues.push("missing");
  const allowed=new Set(getMrTi2ClaimContract(expectedEntityType).claims.map(c=>c.key));const observations=(Array.isArray(root.observations)?root.observations:[]).slice(0,8).map((o,i)=>acceptObservation(o,`observations[${i}]`,expectedClaimKey,allowed,issues)).filter((o):o is MrTi2EvidenceObservation=>o!==null);
  if(!Array.isArray(root.observations))issues.push("observations:array");if(typeof root.missing==="boolean"&&root.missing!==(observations.length===0))issues.push("missingness");
  const valid=root.engineContract==="MR-TI-2.0"&&actualType===expectedEntityType&&root.claimKey===expectedClaimKey&&summary!==null&&typeof root.missing==="boolean"&&root.missing===(observations.length===0);
  return {value:valid?{engineContract:"MR-TI-2.0",entityType:expectedEntityType,claimKey:expectedClaimKey,summary,observations,missing:root.missing as boolean}:null,issues};
}

export function buildMrTi2ClaimRepairInstructions(entityType:TruthEntityType, claimKey:string):string {
  return [
    buildMrTi2EvidenceCollectorInstructions(entityType),
    `REPAIR SCOPE: Research exactly one claim: ${claimKey}. Do not return observations for any other claim.`,
    "FALSIFICATION: Search as seriously for contradictory evidence as supporting evidence.",
    "CANONICAL OUTPUT: You own semantic canonicalisation. Return the canonical claim key, source class, direction, lineage and primitive fields exactly as defined by the response contract. Use null where permitted rather than inventing data.",
    "MISSING RESULT: If no traceable evidence exists after reasonable search, set missing=true and observations=[]. Do not create low-confidence filler.",
    "RELATIONSHIP HINTS: You may identify evidence-supported DEPENDS_ON or CONTRADICTS links to other claims in the same contract, but do not calculate their effect.",
    `PROMPT POLICY: ${MR_TI_2_REPAIR_PROMPT_VERSION}.`,
  ].join("\n\n");
}

import "server-only";
import { createHash } from "node:crypto";
import { databaseRequest } from "@/lib/database/postgrest";
import { sanitisePostgresJson } from "@/lib/database/postgres-json";
import type { MarketRouteGenesisT8CampaignSellerContext } from "./campaign-seller-context";
import type { MarketRouteGenesisSellerConstraintSet } from "./seller-constraint-contracts";

export const MARKETROUTE_GENESIS_T8_COMPLETENESS_VERSION = "MR-R1-BUILD6-1.0.0" as const;
export const MARKETROUTE_GENESIS_T8_COMPLETENESS_SCHEMA = "marketroute_genesis_t8_business_dna_completeness/v1" as const;

type DebtItem = Readonly<{ key:string; category:"MISSING_RESEARCH"|"ONTOLOGY_AMBIGUITY"|"UNKNOWN"; statement:string; sourcePath:string; weight:number }>;
export type MarketRouteGenesisBusinessDnaCompleteness = Readonly<{
 schema: typeof MARKETROUTE_GENESIS_T8_COMPLETENESS_SCHEMA; version: typeof MARKETROUTE_GENESIS_T8_COMPLETENESS_VERSION;
 campaignId:string; organisationId:string; sellerEntityId:string; sellerContextFingerprint:string; constraintFingerprint:string; completenessFingerprint:string; measuredAt:string;
 completenessScore:number; fieldCoverage:number; confidenceCoverage:number; unknownPenalty:number; ambiguityPenalty:number; researchDebtScore:number;
 missingResearch: readonly DebtItem[]; ontologyAmbiguities: readonly DebtItem[]; unknowns: readonly DebtItem[]; researchDebt: readonly DebtItem[];
}>;
const norm=(s:string)=>s.trim();
const hash=(v:unknown)=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
const clamp=(n:number)=>Math.max(0,Math.min(100,Math.round(n*10)/10));
function item(key:string,category:DebtItem["category"],statement:string,sourcePath:string,weight:number):DebtItem{return Object.freeze({key,category,statement,sourcePath,weight});}
function ambiguous(v:string):boolean { const x=norm(v).toLowerCase(); return !x || ["other","general","various","multiple","unknown","n/a","na","all","any","business","businesses","companies"].includes(x) || x.length<3; }
export function buildMarketRouteGenesisBusinessDnaCompleteness(stored:MarketRouteGenesisT8CampaignSellerContext,constraints:MarketRouteGenesisSellerConstraintSet, measuredAt=new Date().toISOString()):MarketRouteGenesisBusinessDnaCompleteness{
 const dna=stored.sellerUnderstanding.legacyBusinessDna; const missing:DebtItem[]=[]; const ambiguities:DebtItem[]=[]; const unknowns:DebtItem[]=[];
 const required:[string,string,string][]=[
  ["company.name",dna.company.name,"businessDNA.company.name"],["company.website",dna.company.website,"businessDNA.company.website"],["company.summary",dna.company.summary,"businessDNA.company.summary"],["company.industry",dna.company.industry,"businessDNA.company.industry"],["company.businessModel",dna.company.businessModel,"businessDNA.company.businessModel"]
 ];
 required.forEach(([k,v,p])=>{if(!norm(v))missing.push(item(k,"MISSING_RESEARCH",`Missing ${k.replace("company.","")} seller fact.`,p,10)); else if(ambiguous(v)) ambiguities.push(item(k,"ONTOLOGY_AMBIGUITY",`${k.replace("company.","")} is too ambiguous for precise ontology mapping.`,p,5));});
 if(!dna.company.locations.length) missing.push(item("company.locations","MISSING_RESEARCH","Seller operating geography is not established.","businessDNA.company.locations",6));
 if(!dna.offers.length) missing.push(item("offers","MISSING_RESEARCH","No seller offering is established.","businessDNA.offers",15));
 dna.offers.forEach((o,i)=>{if(ambiguous(o.name)||ambiguous(o.description)) ambiguities.push(item(`offer.${i}`,"ONTOLOGY_AMBIGUITY","Offering semantics require sharper ontology resolution.",`businessDNA.offers[${i}]`,5));});
 if(!dna.idealCustomers.length) missing.push(item("idealCustomers","MISSING_RESEARCH","No ideal customer profile is established.","businessDNA.idealCustomers",15));
 dna.idealCustomers.forEach((x,i)=>{if(!x.industries.length) missing.push(item(`icp.${i}.industries`,"MISSING_RESEARCH","Preferred customer industries are missing.",`businessDNA.idealCustomers[${i}].industries`,5)); if(!x.buyerRoles.length) missing.push(item(`icp.${i}.buyerRoles`,"MISSING_RESEARCH","Preferred buyer roles are missing.",`businessDNA.idealCustomers[${i}].buyerRoles`,5)); if(!x.pains.length) missing.push(item(`icp.${i}.pains`,"MISSING_RESEARCH","Customer pains are missing.",`businessDNA.idealCustomers[${i}].pains`,5));});
 dna.unknowns.forEach((u,i)=>unknowns.push(item(`unknown.${i}`,"UNKNOWN",u,`businessDNA.unknowns[${i}]`,6)));
 constraints.unknownConstraints.forEach((c,i)=>{if(!unknowns.some(x=>x.statement===c.statement)) unknowns.push(item(`constraintUnknown.${i}`,"UNKNOWN",c.statement,c.sourcePath,6));});
 const slots=5+1+Math.max(1,dna.offers.length)+Math.max(1,dna.idealCustomers.length*3); const covered=Math.max(0,slots-missing.length); const fieldCoverage=clamp(covered/slots*100);
 const confidences=[...dna.offers.map(x=>x.confidence),...dna.idealCustomers.map(x=>x.confidence)].filter(Number.isFinite); const confidenceCoverage=clamp((confidences.length?confidences.reduce((a,b)=>a+b,0)/confidences.length:0)*100);
 const unknownPenalty=clamp(Math.min(35,unknowns.reduce((a,b)=>a+b.weight,0))); const ambiguityPenalty=clamp(Math.min(25,ambiguities.reduce((a,b)=>a+b.weight,0)));
 const completenessScore=clamp(fieldCoverage*.65+confidenceCoverage*.35-unknownPenalty-ambiguityPenalty);
 const researchDebt=Object.freeze([...missing,...ambiguities,...unknowns]); const researchDebtScore=clamp(Math.min(100,researchDebt.reduce((a,b)=>a+b.weight,0)));
 const completenessFingerprint=hash({sellerContextFingerprint:stored.sourceFingerprint,constraintFingerprint:constraints.constraintFingerprint,missing,ambiguities,unknowns,version:MARKETROUTE_GENESIS_T8_COMPLETENESS_VERSION});
 return Object.freeze({schema:MARKETROUTE_GENESIS_T8_COMPLETENESS_SCHEMA,version:MARKETROUTE_GENESIS_T8_COMPLETENESS_VERSION,campaignId:stored.campaignId,organisationId:stored.organisationId,sellerEntityId:stored.sellerUnderstanding.sellerEntity.genesisEntityId,sellerContextFingerprint:stored.sourceFingerprint,constraintFingerprint:constraints.constraintFingerprint,completenessFingerprint,measuredAt,completenessScore,fieldCoverage,confidenceCoverage,unknownPenalty,ambiguityPenalty,researchDebtScore,missingResearch:Object.freeze(missing),ontologyAmbiguities:Object.freeze(ambiguities),unknowns:Object.freeze(unknowns),researchDebt});
}
export async function persistMarketRouteGenesisBusinessDnaCompleteness(x:MarketRouteGenesisBusinessDnaCompleteness):Promise<void>{await databaseRequest("rpc/persist_campaign_genesis_t8_business_dna_completeness",{method:"POST",body:JSON.stringify({p_campaign_id:x.campaignId,p_organisation_id:x.organisationId,p_schema_version:x.schema,p_integration_version:x.version,p_seller_context_fingerprint:x.sellerContextFingerprint,p_constraint_fingerprint:x.constraintFingerprint,p_completeness_fingerprint:x.completenessFingerprint,p_completeness:sanitisePostgresJson(x)})});}
type Row={campaign_id:string;organisation_id:string;schema_version:string;integration_version:string;seller_context_fingerprint:string;constraint_fingerprint:string;completeness_fingerprint:string;completeness_json:unknown};
export async function loadOrMaterialiseMarketRouteGenesisBusinessDnaCompleteness(stored:MarketRouteGenesisT8CampaignSellerContext,constraints:MarketRouteGenesisSellerConstraintSet):Promise<MarketRouteGenesisBusinessDnaCompleteness>{const rows=await databaseRequest<Row[]>(`campaign_genesis_t8_business_dna_completeness?campaign_id=eq.${encodeURIComponent(stored.campaignId)}&organisation_id=eq.${encodeURIComponent(stored.organisationId)}&select=campaign_id,organisation_id,schema_version,integration_version,seller_context_fingerprint,constraint_fingerprint,completeness_fingerprint,completeness_json&limit=1`); if(rows[0]){const r=rows[0]; if(r.schema_version!==MARKETROUTE_GENESIS_T8_COMPLETENESS_SCHEMA||r.integration_version!==MARKETROUTE_GENESIS_T8_COMPLETENESS_VERSION||r.seller_context_fingerprint!==stored.sourceFingerprint||r.constraint_fingerprint!==constraints.constraintFingerprint||!r.completeness_json||typeof r.completeness_json!=="object") throw new Error("GENESIS_BUSINESS_DNA_COMPLETENESS_INVALID"); return Object.freeze(r.completeness_json as MarketRouteGenesisBusinessDnaCompleteness);} const x=buildMarketRouteGenesisBusinessDnaCompleteness(stored,constraints); await persistMarketRouteGenesisBusinessDnaCompleteness(x); return x;}

import "server-only";

import { randomUUID } from "node:crypto";
import { databaseRequest } from "@/lib/database/postgrest";
import { getIntelligenceContract } from "./contracts";
import { hydrateGenesisG8EntityTruth } from "./hydration";
import { ensureGenesisG8ContractClaims, insertGenesisG8Evidence, upsertGenesisG8Entity } from "./persistence/repository";
import type { GenesisG8PersistedClaim } from "./persistence/types";
import type { EvidenceSourceClass, TruthEntityType } from "./truth";

export const GENESIS_G8_DISCOVERY_ACQUISITION_WORKER_VERSION = "G8.1-R12-ACQUISITION-1.0" as const;

type AcquisitionJob = { id:string; source_type:"COMPANY"|"CONTACT"|"ROUTE"; source_id:string; attempt_count:number; lease_token:string };
type Row = Record<string, any>;

type CandidateEvidence = {
  claimKeys:string[]; sourceUrl:string; sourceTitle?:string|null; excerpt?:string|null;
  sourceKind?:string|null; sourceDomain?:string|null; observedAt?:string|null; quality?:number|null; excerptMatched?:boolean;
};

const clean = (v:unknown) => typeof v === "string" ? v.trim() : "";
const clamp01 = (v:number) => Math.max(0,Math.min(1,Number.isFinite(v)?v:0));
function host(url:string){ try{return new URL(url).hostname.toLowerCase().replace(/^www\./,"");}catch{return "unknown";} }
function slug(v:string){ return v.trim().toLowerCase().replace(/\s+/g," "); }
function sourceClass(kind:string|undefined|null,url:string,canonicalDomain?:string):EvidenceSourceClass{
  const k=clean(kind).toUpperCase(); const h=host(url);
  if(k.includes("REGULATORY")||k.includes("GOVERNMENT")||/\.gov\.|\.gov$|companieshouse\.gov\.uk$/.test(h)) return "REGULATORY_OR_GOVERNMENT";
  if(k.includes("LINKEDIN")) return "OFFICIAL_PROFILE";
  if(k.includes("OFFICIAL")||k.includes("PRESS_RELEASE")||(canonicalDomain&&h===canonicalDomain)) return "OFFICIAL_PRIMARY";
  if(k.includes("STAFF_DIRECTORY")) return "INDUSTRY_PUBLICATION";
  return "UNKNOWN";
}
function evidenceStrength(e:CandidateEvidence){ const q=Number(e.quality); return clamp01(Number.isFinite(q)&&q>0?q/100:(e.excerptMatched?0.9:0.72)); }
function claimMap(claims:GenesisG8PersistedClaim[]){ return new Map(claims.map(c=>[c.claimKey,c])); }
async function settle(job:AcquisitionJob,status:"COMPLETED"|"QUEUED"|"FAILED",error?:string|null){
  await databaseRequest("rpc/settle_genesis_g8_discovery_acquisition",{method:"POST",body:JSON.stringify({p_id:job.id,p_lease_token:job.lease_token,p_status:status,p_error:error??null})});
}
async function persistEvidence(entityId:string,entityType:TruthEntityType,items:CandidateEvidence[],canonicalDomain?:string){
  const claims=await ensureGenesisG8ContractClaims(entityId,entityType); const byKey=claimMap(claims); const familySeen=new Map<string,number>(); let inserted=0;
  for(const item of items){
    if(!item.sourceUrl) continue; const family=clean(item.sourceDomain)||host(item.sourceUrl); const seen=familySeen.get(family)||0; familySeen.set(family,seen+1);
    for(const key of [...new Set(item.claimKeys)]){
      const claim=byKey.get(key); if(!claim) continue;
      await insertGenesisG8Evidence({claimId:claim.id,direction:"SUPPORTS",sourceClass:sourceClass(item.sourceKind,item.sourceUrl,canonicalDomain),sourceUri:item.sourceUrl,
        sourceRef:item.sourceTitle??null,sourceFamily:family,excerpt:item.excerpt??null,strength:evidenceStrength(item),traceability:item.excerpt?1:0.8,
        independence:seen===0?1:0.25,observedAt:item.observedAt||new Date().toISOString(),channel:"DISCOVERY_INTELLIGENCE",
        provenance:{channel:"DISCOVERY_INTELLIGENCE",discoveredAt:item.observedAt||new Date().toISOString(),sourceRef:"existing-discovery"}});
      inserted++;
    }
  }
  await hydrateGenesisG8EntityTruth(entityId,{persistIfChanged:true}); return inserted;
}
function companyClaimKeys(row:Row,e:Row):string[]{
  const keys:string[]=[]; const h=host(clean(e.source_url)); const official=h&&h===clean(row.canonical_domain).toLowerCase(); const text=`${clean(e.claim)} ${clean(e.excerpt)}`.toLowerCase();
  if(official) keys.push("identity","canonical_domain","current_operation");
  if(/industr|sector|market/.test(text)) keys.push("industry","sector","customer_market");
  if(/headquarter|located|location|country|based in|operat(es|ing) in/.test(text)) keys.push("geography");
  if(/product|service|platform|solution|provides|offers|manufactur/.test(text)) keys.push("offering");
  if(/hire|recruit|fund|invest|expand|launch|growth|contract|partnership/.test(text)) keys.push("buying_signals");
  return keys;
}
async function acquireCompany(sourceId:string){
  const rows=await databaseRequest<Row[]>(`companies?id=eq.${encodeURIComponent(sourceId)}&limit=1`); const row=rows[0]; if(!row) return {skipped:true,reason:"SOURCE_DELETED"};
  const domain=clean(row.canonical_domain).toLowerCase(); if(!domain||row.verification_status!=="VERIFIED") return {skipped:true,reason:"UNVERIFIED_COMPANY"};
  const entity=await upsertGenesisG8Entity({entityType:"company",canonicalKey:domain,displayName:clean(row.company_name)||domain,contractVersion:getIntelligenceContract("company").version});
  const ev=await databaseRequest<Row[]>(`company_evidence?company_id=eq.${encodeURIComponent(sourceId)}&verified=eq.true&order=created_at.asc`);
  const items=ev.map(e=>({claimKeys:companyClaimKeys(row,e),sourceUrl:clean(e.source_url),sourceTitle:e.source_title,excerpt:e.excerpt,sourceDomain:e.source_domain,observedAt:e.retrieved_at||e.created_at,excerptMatched:e.excerpt_matched})).filter(x=>x.claimKeys.length);
  return {entityId:entity.id,evidenceInserted:await persistEvidence(entity.id,"company",items,domain)};
}
function contactKeys(e:Row):string[]{
  switch(clean(e.evidence_type).toUpperCase()){
    case "IDENTITY": return ["identity","company_relationship","current_employment"];
    case "ROLE": return ["company_relationship","current_employment","role","seniority"];
    case "DEPARTMENT": return ["role","commercial_relevance"];
    case "LOCATION": return ["work_location"];
    case "BUYING_RELEVANCE": return ["authority","commercial_relevance"];
    case "OPERATIONAL_RELEVANCE": return ["commercial_relevance"];
    case "EMAIL": return ["email","email_verification"];
    case "LINKEDIN": return ["linkedin","identity","company_relationship"];
    default:return [];
  }
}
async function acquireContact(sourceId:string){
  const rows=await databaseRequest<Row[]>(`contacts?id=eq.${encodeURIComponent(sourceId)}&limit=1`); const row=rows[0]; if(!row) return {skipped:true,reason:"SOURCE_DELETED"};
  const companies=await databaseRequest<Row[]>(`companies?id=eq.${encodeURIComponent(row.company_id)}&limit=1`); const company=companies[0]; if(!company) return {skipped:true,reason:"COMPANY_MISSING"};
  const domain=clean(company.canonical_domain).toLowerCase(); const linkedin=clean(row.linkedin_profile_url).toLowerCase();
  const key=linkedin||`${domain}::person::${slug(clean(row.normalised_name)||clean(row.full_name))}`; if(!key) return {skipped:true,reason:"CONTACT_KEY_MISSING"};
  const entity=await upsertGenesisG8Entity({entityType:"contact",canonicalKey:key,displayName:clean(row.full_name)||null,contractVersion:getIntelligenceContract("contact").version});
  const ev=await databaseRequest<Row[]>(`contact_evidence?contact_id=eq.${encodeURIComponent(sourceId)}&verified=eq.true&order=quality_score.desc,created_at.asc`);
  const items=ev.map(e=>({claimKeys:contactKeys(e),sourceUrl:clean(e.source_url),sourceTitle:e.source_title,excerpt:e.excerpt,sourceKind:e.source_kind,sourceDomain:e.source_domain,observedAt:e.retrieved_at||e.created_at,quality:e.quality_score,excerptMatched:e.excerpt_matched})).filter(x=>x.claimKeys.length);
  return {entityId:entity.id,evidenceInserted:await persistEvidence(entity.id,"contact",items,domain)};
}
function routeKeys(e:Row):string[]{
  const text=`${clean(e.evidence_type)} ${clean(e.claim)} ${clean(e.excerpt)}`.toLowerCase(); const keys=["target_company","route_identity"];
  if(/entry|contact|email|linkedin|switchboard|department|introduction/.test(text)) keys.push("entry_point","route_path");
  if(/director|head|chief|manager|vp|vice president|decision|buyer|authority|executive/.test(text)) keys.push("decision_maker");
  if(/signal|hire|fund|expand|launch|growth/.test(text)) keys.push("supporting_signal");
  if(/risk|uncertain|dependency|depends/.test(text)) keys.push("risks","dependencies");
  return keys;
}
async function acquireRoute(sourceId:string){
  const rows=await databaseRequest<Row[]>(`commercial_routes?id=eq.${encodeURIComponent(sourceId)}&limit=1`); const row=rows[0]; if(!row) return {skipped:true,reason:"SOURCE_DELETED"};
  const companies=await databaseRequest<Row[]>(`companies?id=eq.${encodeURIComponent(row.company_id)}&limit=1`); const company=companies[0]; if(!company) return {skipped:true,reason:"COMPANY_MISSING"};
  const domain=clean(company.canonical_domain).toLowerCase(); const channel=clean(row.channel_value).toLowerCase();
  const key=`${domain}::route::${slug(clean(row.target_role))}::${clean(row.channel_type).toLowerCase()}::${channel||slug(clean(row.entry_role))}`;
  const entity=await upsertGenesisG8Entity({entityType:"route",canonicalKey:key,displayName:clean(row.label)||`${company.company_name} route`,contractVersion:getIntelligenceContract("route").version});
  const ev=await databaseRequest<Row[]>(`commercial_route_evidence?route_id=eq.${encodeURIComponent(sourceId)}&verified=eq.true&order=quality_score.desc,created_at.asc`);
  const items=ev.map(e=>({claimKeys:routeKeys(e),sourceUrl:clean(e.source_url),sourceTitle:e.source_title,excerpt:e.excerpt,sourceKind:e.source_kind,sourceDomain:e.source_domain,observedAt:e.retrieved_at||e.created_at,quality:e.quality_score,excerptMatched:e.excerpt_matched}));
  return {entityId:entity.id,evidenceInserted:await persistEvidence(entity.id,"route",items,domain)};
}
async function runJob(job:AcquisitionJob){
  try{
    const result=job.source_type==="COMPANY"?await acquireCompany(job.source_id):job.source_type==="CONTACT"?await acquireContact(job.source_id):await acquireRoute(job.source_id);
    await settle(job,"COMPLETED"); return {id:job.id,sourceType:job.source_type,outcome:"COMPLETED" as const,...result};
  }catch(error){ const message=error instanceof Error?error.message:String(error); const retry=job.attempt_count<4&&!/INVALID_ENTITY_TYPE|CONTRACT/.test(message); await settle(job,retry?"QUEUED":"FAILED",message); return {id:job.id,sourceType:job.source_type,outcome:retry?"FAILED_RETRYABLE" as const:"FAILED_FINAL" as const,error:message}; }
}
export async function runGenesisG8DiscoveryAcquisitionWorker(limit=8){
  const jobs=await databaseRequest<AcquisitionJob[]>("rpc/claim_genesis_g8_discovery_acquisitions",{method:"POST",body:JSON.stringify({p_limit:Math.max(1,Math.min(20,Math.trunc(limit))),p_worker_id:`g8-acquisition:${process.env.VERCEL_REGION??"local"}:${randomUUID()}`,p_lease_seconds:60})});
  const receipts=[] as Awaited<ReturnType<typeof runJob>>[]; for(const job of jobs) receipts.push(await runJob(job));
  return {workerVersion:GENESIS_G8_DISCOVERY_ACQUISITION_WORKER_VERSION,claimed:jobs.length,completed:receipts.filter(r=>r.outcome==="COMPLETED").length,failedRetryable:receipts.filter(r=>r.outcome==="FAILED_RETRYABLE").length,failedFinal:receipts.filter(r=>r.outcome==="FAILED_FINAL").length,receipts};
}

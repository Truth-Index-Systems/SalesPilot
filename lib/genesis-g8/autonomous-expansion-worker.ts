import "server-only";

import { randomUUID } from "node:crypto";
import { databaseRequest } from "@/lib/database/postgrest";
import { isAiGovernanceDeferred, aiParallelCapacityReason } from "@/lib/ai/governance";
import { isOpenAIBackgroundPending } from "@/lib/ai/background-response";
import { getIntelligenceContract } from "./contracts";
import { hydrateGenesisG8EntityTruth } from "./hydration";
import { ensureGenesisG8ContractClaims, insertGenesisG8Evidence, upsertGenesisG8Entity } from "./persistence/repository";
import { researchGenesisG82IndustryExpansion, type GenesisG82ExpansionEvidence } from "./autonomous-expansion-openai";
import type { GenesisG8PersistedClaim } from "./persistence/types";
import type { TruthEntityType } from "./truth";

export const GENESIS_G82_AUTONOMOUS_EXPANSION_WORKER_VERSION = "G8.2-R1-AUTONOMOUS-EXPANSION-1.0" as const;

type ExpansionJob={
  id:string; target_id:string; industry_key:string; industry_name:string; attempt_count:number; lease_token:string; excluded_domains:unknown;
};
type PersistCounts={companies:number;contacts:number;routes:number};

function clean(value:unknown){return typeof value==="string"?value.trim():"";}
function domain(value:string){
  const raw=clean(value).toLowerCase(); if(!raw)return "";
  try{return new URL(raw.includes("://")?raw:`https://${raw}`).hostname.replace(/^www\./,"");}catch{return raw.replace(/^https?:\/\//,"").split("/")[0].replace(/^www\./,"");}
}
function sourceFamily(url:string){try{return new URL(url).hostname.toLowerCase().replace(/^www\./,"");}catch{return "unknown";}}
function slug(value:string){return clean(value).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,120);}
function excluded(job:ExpansionJob):string[]{return Array.isArray(job.excluded_domains)?job.excluded_domains.map(clean).map(domain).filter(Boolean):[];}

async function loadKnownCompanyDomains(limit=300):Promise<string[]>{
  const rows=await databaseRequest<Array<{canonical_key?:string}>>(`genesis_g8_intelligence_entities?entity_type=eq.company&status=eq.ACTIVE&select=canonical_key&order=updated_at.desc&limit=${Math.max(1,Math.min(500,limit))}`).catch(()=>[]);
  return rows.map(r=>domain(clean(r.canonical_key))).filter(Boolean);
}

async function membership(targetId:string,entityId:string,entityType:"company"|"contact"|"route",canonicalDomain?:string|null){
  await databaseRequest("rpc/record_genesis_g82_expansion_membership",{method:"POST",body:JSON.stringify({p_target_id:targetId,p_entity_id:entityId,p_entity_type:entityType,p_canonical_domain:canonicalDomain??null})});
}

async function persistEvidence(params:{entityId:string;entityType:TruthEntityType;evidence:GenesisG82ExpansionEvidence[];sourceRef:string}){
  const claims=await ensureGenesisG8ContractClaims(params.entityId,params.entityType);
  const byKey=new Map<string,GenesisG8PersistedClaim>(claims.map(c=>[c.claimKey,c]));
  const familyCounts=new Map<string,number>(); let inserted=0;
  for(const e of params.evidence){
    const claim=byKey.get(e.claimKey); if(!claim)continue;
    const family=sourceFamily(e.sourceUrl); const seen=familyCounts.get(family)??0; familyCounts.set(family,seen+1);
    await insertGenesisG8Evidence({
      claimId:claim.id,direction:"SUPPORTS",sourceClass:e.sourceClass,sourceUri:e.sourceUrl,sourceRef:e.sourceTitle,
      sourceFamily:family,excerpt:e.excerpt,strength:Math.max(0,Math.min(1,e.directness/100)),traceability:1,independence:seen===0?1:0.25,
      observedAt:new Date().toISOString(),channel:"DISCOVERY_INTELLIGENCE",provenance:{channel:"DISCOVERY_INTELLIGENCE",discoveredAt:new Date().toISOString(),sourceRef:params.sourceRef},
    }); inserted++;
  }
  await hydrateGenesisG8EntityTruth(params.entityId,{persistIfChanged:true});
  return inserted;
}

async function persistCompany(job:ExpansionJob,c:any,seenDomains:Set<string>):Promise<PersistCounts>{
  const canonicalDomain=domain(c.domain); if(!canonicalDomain||seenDomains.has(canonicalDomain))return {companies:0,contacts:0,routes:0};
  seenDomains.add(canonicalDomain);
  const entity=await upsertGenesisG8Entity({entityType:"company",canonicalKey:canonicalDomain,displayName:clean(c.name)||canonicalDomain,contractVersion:getIntelligenceContract("company").version});
  await persistEvidence({entityId:entity.id,entityType:"company",evidence:Array.isArray(c.evidence)?c.evidence:[],sourceRef:`g82-expansion:${job.id}:${job.industry_key}`});
  await membership(job.target_id,entity.id,"company",canonicalDomain);
  let contacts=0,routes=0;
  for(const person of Array.isArray(c.contacts)?c.contacts:[]){
    const identity=clean(person.linkedinUrl)||slug(clean(person.name)); if(!identity)continue;
    const key=`${canonicalDomain}::contact::${identity.toLowerCase()}`;
    const contact=await upsertGenesisG8Entity({entityType:"contact",canonicalKey:key,displayName:clean(person.name)||null,contractVersion:getIntelligenceContract("contact").version});
    const evidence=Array.isArray(person.evidence)?person.evidence:[];
    if(evidence.length===0)continue;
    await persistEvidence({entityId:contact.id,entityType:"contact",evidence,sourceRef:`g82-expansion:${job.id}:${job.industry_key}`});
    await membership(job.target_id,contact.id,"contact",canonicalDomain); contacts++;
  }
  for(const route of Array.isArray(c.routes)?c.routes:[]){
    const evidence=Array.isArray(route.evidence)?route.evidence:[]; if(evidence.length===0)continue;
    const channelType=slug(clean(route.channelType)||"public"); const channelValue=clean(route.channelValue)||clean(route.routePath)||clean(route.label);
    const key=`${canonicalDomain}::route::${slug(clean(route.targetRole)||"general")}::${channelType}::${slug(channelValue)}`;
    const r=await upsertGenesisG8Entity({entityType:"route",canonicalKey:key,displayName:clean(route.label)||`${clean(c.name)||canonicalDomain} route`,contractVersion:getIntelligenceContract("route").version});
    await persistEvidence({entityId:r.id,entityType:"route",evidence,sourceRef:`g82-expansion:${job.id}:${job.industry_key}`});
    await membership(job.target_id,r.id,"route",canonicalDomain); routes++;
  }
  return {companies:1,contacts,routes};
}

async function settle(job:ExpansionJob,status:"QUEUED"|"COMPLETED"|"FAILED",counts:PersistCounts,found:number,error?:string|null){
  await databaseRequest("rpc/settle_genesis_g82_expansion_job",{method:"POST",body:JSON.stringify({
    p_job_id:job.id,p_lease_token:job.lease_token,p_status:status,p_companies_found:found,p_companies_persisted:counts.companies,
    p_contacts_persisted:counts.contacts,p_routes_persisted:counts.routes,p_error:error??null,
  })});
}

async function runJob(job:ExpansionJob){
  const counts:PersistCounts={companies:0,contacts:0,routes:0}; let found=0;
  try{
    const known=[...new Set([...excluded(job),...(await loadKnownCompanyDomains())])];
    const result=await researchGenesisG82IndustryExpansion({jobId:job.id,industryKey:job.industry_key,industryName:job.industry_name,excludedDomains:known});
    found=result.companies.length; const seen=new Set(known);
    for(const company of result.companies){const p=await persistCompany(job,company,seen);counts.companies+=p.companies;counts.contacts+=p.contacts;counts.routes+=p.routes;}
    await settle(job,"COMPLETED",counts,found);
    return {jobId:job.id,industry:job.industry_name,outcome:"COMPLETED" as const,companiesFound:found,...counts};
  }catch(error){
    const message=error instanceof Error?error.message:String(error);
    if(isOpenAIBackgroundPending(error)||isAiGovernanceDeferred(error)||aiParallelCapacityReason(error)){
      await settle(job,"QUEUED",counts,found,message); return {jobId:job.id,industry:job.industry_name,outcome:"PENDING" as const,companiesFound:found,...counts,error:message};
    }
    const retryable=job.attempt_count<7&&!/NOT_CONFIGURED|INVALID_SCHEMA|ENTITY_UPSERT/.test(message);
    await settle(job,retryable?"QUEUED":"FAILED",counts,found,message);
    return {jobId:job.id,industry:job.industry_name,outcome:retryable?"FAILED_RETRYABLE" as const:"FAILED_FINAL" as const,companiesFound:found,...counts,error:message};
  }
}

export async function ensureGenesisG82ExpansionBacklog(limit=1){
  return databaseRequest<Array<{job_id:string;industry_key:string;industry_name:string}>>("rpc/ensure_genesis_g82_expansion_backlog",{method:"POST",body:JSON.stringify({p_limit:Math.max(1,Math.min(4,Math.trunc(limit)))})});
}

export async function runGenesisG82AutonomousExpansionWorker(limit=1){
  await ensureGenesisG82ExpansionBacklog(limit);
  const jobs=await databaseRequest<ExpansionJob[]>("rpc/claim_genesis_g82_expansion_jobs",{method:"POST",body:JSON.stringify({p_limit:Math.max(1,Math.min(2,Math.trunc(limit))),p_worker_id:`g82-expansion:${process.env.VERCEL_REGION??"local"}:${randomUUID()}`,p_lease_seconds:180})});
  const receipts=[] as Awaited<ReturnType<typeof runJob>>[]; for(const job of jobs)receipts.push(await runJob(job));
  return {workerVersion:GENESIS_G82_AUTONOMOUS_EXPANSION_WORKER_VERSION,claimed:jobs.length,completed:receipts.filter(r=>r.outcome==="COMPLETED").length,pending:receipts.filter(r=>r.outcome==="PENDING").length,failedRetryable:receipts.filter(r=>r.outcome==="FAILED_RETRYABLE").length,failedFinal:receipts.filter(r=>r.outcome==="FAILED_FINAL").length,receipts};
}

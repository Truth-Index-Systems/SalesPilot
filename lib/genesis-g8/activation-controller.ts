import "server-only";
import { createHash } from "node:crypto";
import { databaseRequest } from "@/lib/database/postgrest";

export const GENESIS_G8_ACTIVATION_VERSION = "G8.1-R20-ADAPTIVE-DEFAULT-1.0" as const;
export const GENESIS_G8_OPERATING_MODEL = "ADAPTIVE_DEFAULT" as const;
export type GenesisG8ActivationLevel = 0|1|2|3|4|5;
export type GenesisG8ActivationMode = "OFF"|"ALLOWLIST"|"CANARY"|"CONTROLLED"|"KNOWLEDGE_FIRST"|"ADAPTIVE_DEFAULT";

type RuntimeSnapshot = {
  configured_level?: number;
  system_default_level?: number;
  founder_override_level?: number|null;
  founder_override_active?: boolean;
  operating_model?: string;
  g8_v1_frozen_at?: string|null;
  allowlist?: unknown;
  attempted?: number;
  activated?: number;
  fallback?: number;
  failed?: number;
  repair_burden?: number;
  rejected_entities?: number;
};

export type GenesisG8ActivationDecision = {
  version: typeof GENESIS_G8_ACTIVATION_VERSION;
  operatingModel: typeof GENESIS_G8_OPERATING_MODEL;
  configuredLevel: GenesisG8ActivationLevel;
  effectiveLevel: GenesisG8ActivationLevel;
  mode: GenesisG8ActivationMode;
  activated: boolean;
  cohortPercent: number;
  candidateLimit: number;
  reasons: string[];
  rollbackApplied: boolean;
  rollbackSteps: number;
};

const LEVELS: Record<GenesisG8ActivationLevel,{mode:GenesisG8ActivationMode;cohortPercent:number;candidateLimit:number}> = {
  0:{mode:"OFF",cohortPercent:0,candidateLimit:0},
  1:{mode:"ALLOWLIST",cohortPercent:0,candidateLimit:5},
  2:{mode:"CANARY",cohortPercent:10,candidateLimit:5},
  3:{mode:"CONTROLLED",cohortPercent:25,candidateLimit:25},
  4:{mode:"KNOWLEDGE_FIRST",cohortPercent:50,candidateLimit:25},
  5:{mode:"ADAPTIVE_DEFAULT",cohortPercent:100,candidateLimit:25},
};

const boundedLevel=(value:unknown):GenesisG8ActivationLevel=>Math.max(0,Math.min(5,Math.trunc(Number(value)||0))) as GenesisG8ActivationLevel;
const arr=(value:unknown)=>Array.isArray(value)?value.map(String):[];
const n=(value:unknown)=>Number.isFinite(Number(value))?Number(value):0;

export async function readGenesisG8ActivationRuntime():Promise<RuntimeSnapshot>{
  try {
    return await databaseRequest<RuntimeSnapshot>("rpc/genesis_g8_activation_runtime_snapshot",{method:"POST",body:"{}"});
  } catch {
    // Missing migration/database failure must never default to Knowledge.
    return {configured_level:0,system_default_level:0,founder_override_active:false,operating_model:"FAIL_CLOSED"};
  }
}

function rollbackFor(runtime:RuntimeSnapshot,configured:GenesisG8ActivationLevel){
  const attempted=n(runtime.attempted), fallback=n(runtime.fallback), failed=n(runtime.failed), burden=n(runtime.repair_burden), rejected=n(runtime.rejected_entities);
  if(attempted<20) return {effective:configured,steps:0};
  const failureRate=failed/attempted, fallbackRate=fallback/attempted;
  const severe=failureRate>=0.30 || fallbackRate>=0.60 || rejected>=8 || burden>=30;
  const degraded=failureRate>=0.15 || fallbackRate>=0.35 || rejected>=3 || burden>=15;
  const steps=severe?2:degraded?1:0;
  return {effective:boundedLevel(Math.max(0,configured-steps)),steps};
}

export function summariseGenesisG8ActivationRuntime(runtime:RuntimeSnapshot){
  const configured=boundedLevel(runtime.configured_level);
  const rollback=rollbackFor(runtime,configured);
  const effective=rollback.effective;
  const attempted=n(runtime.attempted), fallback=n(runtime.fallback), failed=n(runtime.failed), burden=n(runtime.repair_burden), rejected=n(runtime.rejected_entities);
  return {
    configuredLevel:configured,effectiveLevel:effective,mode:LEVELS[effective].mode,
    cohortPercent:LEVELS[effective].cohortPercent,candidateLimit:LEVELS[effective].candidateLimit,
    attempted,activated:n(runtime.activated),fallback,failed,repairBurden:burden,rejectedEntities:rejected,
    rollbackApplied:effective<configured,rollbackSteps:rollback.steps,
    systemDefaultLevel:boundedLevel(runtime.system_default_level??5),
    founderOverrideLevel:runtime.founder_override_level==null?null:boundedLevel(runtime.founder_override_level),
    founderOverrideActive:runtime.founder_override_active===true,
    operatingModel:String(runtime.operating_model??GENESIS_G8_OPERATING_MODEL),
    frozenAt:runtime.g8_v1_frozen_at??null,
  };
}

export function genesisG8RolloutBucket(campaignId:string){
  const hex=createHash("sha256").update(`${GENESIS_G8_ACTIVATION_VERSION}|${campaignId}`).digest("hex").slice(0,8);
  return parseInt(hex,16)%100;
}

export function decideGenesisG8Activation(params:{campaignId:string;organisationId:string;runtime:RuntimeSnapshot;candidateTruth?:number;candidateConfidence?:number;candidateCoverage?:number;candidateBlocking?:boolean;}):GenesisG8ActivationDecision{
  const configured=boundedLevel(params.runtime.configured_level);
  const rollback=rollbackFor(params.runtime,configured);
  const effective=rollback.effective;
  const reasons:string[]=[];
  if(rollback.steps>0) reasons.push(`Automatic safety rollback reduced rollout by ${rollback.steps} level${rollback.steps===1?"":"s"} after recent production signals.`);
  const cfg=LEVELS[effective];
  if(effective===0) reasons.push("Genesis production activation is off; Discovery remains authoritative.");
  const allowlist=arr(params.runtime.allowlist);
  const bucket=genesisG8RolloutBucket(params.campaignId);
  const cohortOk=effective===5 || (effective===1 ? allowlist.includes(params.organisationId) : bucket<cfg.cohortPercent);
  if(!cohortOk) reasons.push(effective===1?"Organisation is outside the founder allowlist.":`Campaign is outside the ${cfg.cohortPercent}% controlled cohort.`);
  // R20 does not invent a second Truth policy. These are defence-in-depth floors;
  // R13/R5 mayUseKnowledgeImmediately and blocking state remain the real eligibility authority.
  const qualityOk=(params.candidateTruth??100)>=55 && (params.candidateConfidence??100)>=60 && (params.candidateCoverage??100)>=0 && params.candidateBlocking!==true;
  if(!qualityOk) reasons.push("Candidate failed the adaptive-default defence-in-depth quality gate.");
  const activated=effective>0 && cohortOk && qualityOk;
  if(activated) reasons.push(effective===5?"Adaptive Default authorised eligible Knowledge first with Discovery fallback/enrichment.":`Genesis activation level ${effective} authorised Knowledge acceleration.`);
  return {version:GENESIS_G8_ACTIVATION_VERSION,operatingModel:GENESIS_G8_OPERATING_MODEL,configuredLevel:configured,effectiveLevel:effective,mode:cfg.mode,activated,cohortPercent:cfg.cohortPercent,candidateLimit:cfg.candidateLimit,reasons,rollbackApplied:effective<configured,rollbackSteps:rollback.steps};
}

export async function recordGenesisG8ActivationEvent(input:{organisationId:string;campaignId:string;configuredLevel:number;effectiveLevel:number;decision:string;reason:string;candidateCount:number;seededCount:number;latencyMs:number;fallbackUsed:boolean;failed:boolean;}){
  try{
    await databaseRequest("genesis_g8_activation_events",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({
      activation_version:GENESIS_G8_ACTIVATION_VERSION,organisation_id:input.organisationId,campaign_id:input.campaignId,configured_level:input.configuredLevel,effective_level:input.effectiveLevel,decision:input.decision,reason:left(input.reason,1000),candidate_count:input.candidateCount,seeded_count:input.seededCount,latency_ms:Math.max(0,Math.round(input.latencyMs)),fallback_used:input.fallbackUsed,failed:input.failed
    })});
  }catch(error){console.warn("Genesis G8 activation telemetry failed open",error);}
}
function left(value:string,max:number){return value.length>max?value.slice(0,max):value;}

export async function setGenesisG8ActivationLevel(level:GenesisG8ActivationLevel){
  return databaseRequest("rpc/set_genesis_g8_activation_override",{method:"POST",body:JSON.stringify({p_level:level})});
}

export async function clearGenesisG8ActivationOverride(){
  return databaseRequest("rpc/clear_genesis_g8_activation_override",{method:"POST",body:"{}"});
}

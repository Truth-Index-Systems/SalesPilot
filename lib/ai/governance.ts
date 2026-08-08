import "server-only";
import { createHash } from "node:crypto";
import { databaseRequest } from "@/lib/database/postgrest";

export type AiJobType = "BUSINESS_ANALYSIS"|"COMPANY_DISCOVERY"|"CONTACT_DISCOVERY"|"OUTREACH"|"COMMERCIAL_REASONING"|"REPLY_INTELLIGENCE";
export type AiGovernanceContext = {
  organisationId:string|null;
  campaignId?:string|null;
  schedulerRunId?:string|null;
  jobType:AiJobType;
  jobId?:string|null;
  requestScope:string;
  model:string;
  estimatedCostUsd:number;
};

type Reservation={allowed:boolean;ledger_id:string|null;reason_code:string|null;requests_today:number;cost_today:number;request_limit:number;cost_limit:number};
type Usage={input_tokens?:number;output_tokens?:number;total_tokens?:number;cached_input_tokens?:number;reasoning_tokens?:number};

function platformEnabled(){return process.env.SALESPILOT_AI_PLATFORM_ENABLED?.trim().toLowerCase()==="true";}
function requestKey(context:AiGovernanceContext){return createHash("sha256").update([context.organisationId??"anonymous",context.campaignId??"none",context.jobType,context.jobId??"none",context.requestScope].join(":"),"utf8").digest("hex");}
export function estimateActualCost(usage:Usage|undefined,webSearchCalls=0){
  const inputRate=Number(process.env.SALESPILOT_AI_INPUT_USD_PER_MILLION??"2.5");
  const outputRate=Number(process.env.SALESPILOT_AI_OUTPUT_USD_PER_MILLION??"10");
  const searchRate=Number(process.env.SALESPILOT_AI_WEB_SEARCH_USD_PER_CALL??"0.01");
  return (((usage?.input_tokens??0)/1_000_000)*inputRate)+(((usage?.output_tokens??0)/1_000_000)*outputRate)+(webSearchCalls*searchRate);
}

export function aiGovernanceBlockReason(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const match = message.match(/AI_GOVERNANCE_BLOCKED:([A-Z0-9_]+)/i);
  return match ? match[1].toUpperCase() : null;
}

export function isAiGovernanceDeferred(error: unknown): boolean {
  return aiGovernanceBlockReason(error) !== null;
}

export function aiParallelCapacityReason(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const match = message.match(/AI_PARALLEL_CAPACITY:([A-Z0-9_]+)/i);
  return match ? match[1].toUpperCase() : null;
}

export async function reserveAiRequest(context:AiGovernanceContext){
  const key=requestKey(context);
  // A previously submitted background response is already committed provider work.
  // Resume/polling must remain possible even if the workspace reaches its allowance
  // or the platform gate is subsequently paused; no new model request is created.
  const existing=await databaseRequest<Array<{id:string;status:string}>>(`ai_usage_ledger?request_key=eq.${encodeURIComponent(key)}&status=in.(RESERVED,SUCCEEDED)&select=id,status&limit=1`).catch(()=>[]);
  if(existing[0]?.id)return {ledgerId:existing[0].id};
  if(!platformEnabled())throw new Error("AI_GOVERNANCE_BLOCKED:PLATFORM_DISABLED");
  const result=await databaseRequest<Reservation[]|Reservation>("rpc/reserve_ai_request",{method:"POST",body:JSON.stringify({
    p_organisation_id:context.organisationId,p_campaign_id:context.campaignId??null,p_scheduler_run_id:context.schedulerRunId??null,
    p_job_type:context.jobType,p_job_id:context.jobId??null,p_request_key:key,p_model:context.model,p_estimated_cost_usd:Math.max(0,context.estimatedCostUsd),
  })});
  const reservation=Array.isArray(result)?result[0]:result;
  if(!reservation?.allowed||!reservation.ledger_id){
    const reason=reservation?.reason_code??"UNKNOWN";
    if(reason.startsWith("PARALLEL_")) throw new Error(`AI_PARALLEL_CAPACITY:${reason}`);
    throw new Error(`AI_GOVERNANCE_BLOCKED:${reason}`);
  }
  return {ledgerId:reservation.ledger_id};
}

export async function completeAiRequest(params:{ledgerId:string;ok:boolean;usage?:Usage;webSearchCalls?:number;durationMs:number;responseId?:string|null;errorCode?:string|null;errorMessage?:string|null}){
  const actual=estimateActualCost(params.usage,params.webSearchCalls??0);
  await databaseRequest("rpc/complete_ai_request",{method:"POST",body:JSON.stringify({p_ledger_id:params.ledgerId,p_status:params.ok?"SUCCEEDED":"FAILED",p_actual_cost_usd:actual,p_input_tokens:params.usage?.input_tokens??null,p_output_tokens:params.usage?.output_tokens??null,p_web_search_calls:params.webSearchCalls??0,p_duration_ms:params.durationMs,p_response_id:params.responseId??null,p_error_code:params.errorCode??null,p_error_message:params.errorMessage??null})});
  if(params.usage?.cached_input_tokens!=null||params.usage?.reasoning_tokens!=null){
    await databaseRequest("rpc/record_ai_token_details",{method:"POST",body:JSON.stringify({p_ledger_id:params.ledgerId,p_cached_input_tokens:params.usage?.cached_input_tokens??0,p_reasoning_tokens:params.usage?.reasoning_tokens??0})}).catch(()=>undefined);
  }
}

export function responseUsage(value:unknown):Usage|undefined{
  if(!value||typeof value!=="object")return undefined;
  const usage=(value as {usage?:unknown}).usage;
  if(!usage||typeof usage!=="object")return undefined;
  const row=usage as Record<string,unknown>;
  const inputDetails=row.input_tokens_details&&typeof row.input_tokens_details==="object"?row.input_tokens_details as Record<string,unknown>:{};
  const outputDetails=row.output_tokens_details&&typeof row.output_tokens_details==="object"?row.output_tokens_details as Record<string,unknown>:{};
  return {input_tokens:typeof row.input_tokens==="number"?row.input_tokens:undefined,output_tokens:typeof row.output_tokens==="number"?row.output_tokens:undefined,total_tokens:typeof row.total_tokens==="number"?row.total_tokens:undefined,cached_input_tokens:typeof inputDetails.cached_tokens==="number"?inputDetails.cached_tokens:undefined,reasoning_tokens:typeof outputDetails.reasoning_tokens==="number"?outputDetails.reasoning_tokens:undefined};
}

import "server-only";

import { discardOpenAIBackgroundResponse, fetchResumableOpenAIResponse, isOpenAIBackgroundPending, isOpenAIBackgroundTerminal } from "@/lib/ai/background-response";
import { completeAiRequest, reserveAiRequest, responseUsage } from "@/lib/ai/governance";
import { canonicaliseWithAi, decodeAiJson, type HardAcceptance } from "./ai-canonicalisation";
import { aiWorkloadProfile } from "@/lib/ai/workload-profile";
import { aiRequestTimeoutMs, classifyOpenAITransportError } from "@/lib/ai/request-policy";
import { stableFingerprint } from "@/lib/ai/cost-optimisation";
import { resolveOpenAIModel } from "@/lib/intelligence/model-router";
import type { GenesisG8EntityType as TruthEntityType } from "./entity-types";
import { buildMrTi2ClaimRepairInstructions, hardAcceptMrTi2ClaimRepairResult, mrTi2ClaimRepairJsonSchema, type MrTi2ClaimRepairResult } from "./truth-v2/ai/repair-contract";

export const GENESIS_G8_MRTI2_REPAIR_RESEARCH_VERSION="G8-MRTI2-B8.3.4-AI-CANONICALISATION-1.2" as const;

/** Post-freeze transport/persistence safety boundary. TI-2.1.8 remains byte-for-byte frozen. */
function isRfc3339Timestamp(value:string):boolean {
  const pattern=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
  return pattern.test(value)&&Number.isFinite(Date.parse(value));
}

function assertRepairTimestampBoundary(result:MrTi2ClaimRepairResult):MrTi2ClaimRepairResult {
  for(const [index,observation] of result.observations.entries()){
    if(observation.sourcePublishedAt!==null&&!isRfc3339Timestamp(observation.sourcePublishedAt)){
      throw new Error(`GENESIS_G8_MRTI2_REPAIR_INVALID_SOURCE_PUBLISHED_AT:${index}`);
    }
    if(!isRfc3339Timestamp(observation.observedAt)){
      throw new Error(`GENESIS_G8_MRTI2_REPAIR_INVALID_OBSERVED_AT:${index}`);
    }
  }
  return result;
}

export interface GenesisG8MrTi2RepairInput {
  repairId:string; entityId:string; entityType:TruthEntityType; entityCanonicalKey:string; entityDisplayName?:string|null;
  claimId:string; claimKey:string; claimLabel:string; objective:string; repairMode:string; organisationId?:string|null; campaignId?:string|null;
}

export async function researchGenesisG8ClaimRepairV2(input:GenesisG8MrTi2RepairInput):Promise<MrTi2ClaimRepairResult>{
  const apiKey=process.env.OPENAI_API_KEY?.trim(); if(!apiKey) throw new Error("OPENAI_API_KEY_NOT_CONFIGURED");
  const model=resolveOpenAIModel("analysis").model;
  const organisationId=input.organisationId??process.env.MARKETROUTE_G8_SYSTEM_ORGANISATION_ID?.trim()??null;
  const profile=aiWorkloadProfile("GENESIS_G8_REPAIR"); const timeoutMs=aiRequestTimeoutMs("GENESIS_G8_REPAIR");
  const observedAt=new Date().toISOString();
  const baseScope=`genesis-g8-mrti2-repair:${stableFingerprint({version:GENESIS_G8_MRTI2_REPAIR_RESEARCH_VERSION,entityId:input.entityId,claimId:input.claimId,objective:input.objective,repairMode:input.repairMode})}`;
  let requestScope=baseScope; let lastTerminalError:Error|null=null;
  for(let generation=0;generation<3;generation++){
    const reservation=await reserveAiRequest({organisationId,campaignId:input.campaignId??null,jobType:"GENESIS_G8_REPAIR",jobId:input.repairId,requestScope,model,estimatedCostUsd:Math.max(.005,Number(process.env.MARKETROUTE_G8_REPAIR_ESTIMATED_COST_USD??"0.04")||.04)});
    const startedAt=Date.now(); let response:Response;
    try{
      response=await fetchResumableOpenAIResponse({apiKey,task:"GENESIS_G8_REPAIR",organisationId,campaignId:input.campaignId??null,jobType:"GENESIS_G8_REPAIR",jobId:input.repairId,requestScope,model,ledgerId:reservation.ledgerId},{
        method:"POST",cache:"no-store",signal:AbortSignal.timeout(timeoutMs),headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},
        body:JSON.stringify({
          model,
          instructions:buildMrTi2ClaimRepairInstructions(input.entityType,input.claimKey),
          input:JSON.stringify({entityId:input.entityId,entityType:input.entityType,entityCanonicalKey:input.entityCanonicalKey,entityDisplayName:input.entityDisplayName??null,claimKey:input.claimKey,claimLabel:input.claimLabel,objective:input.objective,repairMode:input.repairMode,observedAt}),
          tools:[{type:"web_search_preview",search_context_size:"medium"}], reasoning:{effort:profile.reasoningEffort},
          text:{format:{type:"json_schema",name:"mr_ti_2_claim_repair_v1",strict:true,schema:mrTi2ClaimRepairJsonSchema}}, max_output_tokens:Math.max(profile.maxOutputTokens,5000),store:false,
        }),
      });
    }catch(error){
      if(isOpenAIBackgroundPending(error)) throw error;
      if(isOpenAIBackgroundTerminal(error)){
        const reason=error.providerReason??`Provider response ended ${error.status}`;
        await completeAiRequest({ledgerId:reservation.ledgerId,ok:false,durationMs:Date.now()-startedAt,responseId:error.responseId,errorCode:`OPENAI_BACKGROUND_${error.status.toUpperCase()}`,errorMessage:reason}).catch(()=>undefined);
        lastTerminalError=new Error(`GENESIS_G8_MRTI2_REPAIR_BACKGROUND_TERMINAL:${error.status}:${reason}`); requestScope=`${baseScope}:retry:${stableFingerprint({previousScope:requestScope,responseId:error.responseId})}`; continue;
      }
      const transport=classifyOpenAITransportError(error,"GENESIS_G8_REPAIR",timeoutMs); await completeAiRequest({ledgerId:reservation.ledgerId,ok:false,durationMs:Date.now()-startedAt,errorCode:transport.code,errorMessage:transport.error.message}).catch(()=>undefined); throw transport.error;
    }
    const json:unknown=await response.json().catch(()=>null); const responseId=typeof (json as any)?.id==="string"?(json as any).id:null;
    if(!response.ok){await completeAiRequest({ledgerId:reservation.ledgerId,ok:false,usage:responseUsage(json),webSearchCalls:1,durationMs:Date.now()-startedAt,responseId,errorCode:`HTTP_${response.status}`,errorMessage:JSON.stringify((json as any)?.error??null)}).catch(()=>undefined);throw new Error(`GENESIS_G8_MRTI2_REPAIR_OPENAI_FAILED:${response.status}`);}
    if((json as any)?.status==="incomplete"){
      const reason=typeof (json as any)?.incomplete_details?.reason==="string"?(json as any).incomplete_details.reason:"UNKNOWN";
      await completeAiRequest({ledgerId:reservation.ledgerId,ok:false,usage:responseUsage(json),webSearchCalls:1,durationMs:Date.now()-startedAt,responseId,errorCode:"INCOMPLETE_RESPONSE",errorMessage:reason}).catch(()=>undefined);
      if(responseId){lastTerminalError=new Error(`GENESIS_G8_MRTI2_REPAIR_INCOMPLETE:${reason}`);requestScope=`${baseScope}:retry:${stableFingerprint({previousScope:requestScope,responseId})}`;continue;} throw lastTerminalError??new Error(`GENESIS_G8_MRTI2_REPAIR_INCOMPLETE:${reason}`);
    }
    await completeAiRequest({ledgerId:reservation.ledgerId,ok:true,usage:responseUsage(json),webSearchCalls:1,durationMs:Date.now()-startedAt,responseId});
    let accepted:HardAcceptance<MrTi2ClaimRepairResult>;
    try{accepted=hardAcceptMrTi2ClaimRepairResult(input.entityType,input.claimKey,decodeAiJson(json));}catch(error){accepted={value:null,issues:[error instanceof Error?error.message:"AI_OUTPUT_JSON_INVALID"]};}
    if(accepted.value&&accepted.issues.length===0)return assertRepairTimestampBoundary(accepted.value);
    try{
      const canonicalised=await canonicaliseWithAi({apiKey,model,organisationId,campaignId:input.campaignId??null,jobType:"GENESIS_G8_REPAIR",task:"GENESIS_G8_REPAIR",jobId:input.repairId,parentScope:requestScope,rawResponse:json,schemaName:"mr_ti_2_claim_repair_v1",jsonSchema:mrTi2ClaimRepairJsonSchema,instructions:`Canonicalise exactly one ${input.entityType} claim (${input.claimKey}). Preserve only evidence already present in the supplied research. Do not widen to another claim. Ensure missing=true iff observations is empty. Preserve provenance and MR-TI-2 primitive scales.`,accept:(value)=>hardAcceptMrTi2ClaimRepairResult(input.entityType,input.claimKey,value),estimatedCostUsd:0.008});
      return assertRepairTimestampBoundary(canonicalised);
    }catch(error){
      if(isOpenAIBackgroundPending(error))throw error;
      console.warn("Repair AI canonicalisation failed",{issues:accepted.issues.slice(0,8),error:error instanceof Error?error.message:String(error)});
      if(accepted.value)return accepted.value;
      await discardOpenAIBackgroundResponse({organisationId,campaignId:input.campaignId??null,jobType:"GENESIS_G8_REPAIR",jobId:input.repairId,requestScope}).catch(()=>undefined);
      throw new Error(`GENESIS_G8_MRTI2_REPAIR_HARD_GATE:${accepted.issues.slice(0,8).join("|")}`);
    }
  }
  throw lastTerminalError??new Error("GENESIS_G8_MRTI2_REPAIR_TERMINAL_RETRY_LIMIT");
}

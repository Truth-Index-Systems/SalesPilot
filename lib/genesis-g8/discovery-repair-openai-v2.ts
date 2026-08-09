import "server-only";

import { discardOpenAIBackgroundResponse, fetchResumableOpenAIResponse, isOpenAIBackgroundPending, isOpenAIBackgroundTerminal } from "@/lib/ai/background-response";
import { completeAiRequest, reserveAiRequest, responseUsage } from "@/lib/ai/governance";
import { parseStructuredAiResponse, safeStructuredAiError } from "@/lib/ai/structured-response-gateway";
import { aiWorkloadProfile } from "@/lib/ai/workload-profile";
import { aiRequestTimeoutMs, classifyOpenAITransportError } from "@/lib/ai/request-policy";
import { stableFingerprint } from "@/lib/ai/cost-optimisation";
import { resolveOpenAIModel } from "@/lib/intelligence/model-router";
import type { GenesisG8EntityType as TruthEntityType } from "./entity-types";
import { MrTi2ClaimRepairResultSchema, buildMrTi2ClaimRepairInstructions, mrTi2ClaimRepairJsonSchema, validateMrTi2ClaimRepairResult, type MrTi2ClaimRepairResult } from "./truth-v2/ai/repair-contract";

export const GENESIS_G8_MRTI2_REPAIR_RESEARCH_VERSION="G8-MRTI2-B7-REPAIR-1.0" as const;

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
    try{
      const parsed=await parseStructuredAiResponse({response:json,schema:MrTi2ClaimRepairResultSchema,jsonSchema:mrTi2ClaimRepairJsonSchema,schemaName:"mr_ti_2_claim_repair_v1",apiKey,model});
      const validated=validateMrTi2ClaimRepairResult(input.entityType,input.claimKey,parsed.value);
      await completeAiRequest({ledgerId:reservation.ledgerId,ok:true,usage:responseUsage(json),webSearchCalls:1,durationMs:Date.now()-startedAt,responseId}); return validated;
    }catch(error){
      await discardOpenAIBackgroundResponse({organisationId,campaignId:input.campaignId??null,jobType:"GENESIS_G8_REPAIR",jobId:input.repairId,requestScope}).catch(()=>undefined);
      const safe=safeStructuredAiError(error); await completeAiRequest({ledgerId:reservation.ledgerId,ok:false,usage:responseUsage(json),webSearchCalls:1,durationMs:Date.now()-startedAt,responseId,errorCode:safe.code,errorMessage:safe.message}).catch(()=>undefined); throw new Error(`GENESIS_G8_MRTI2_REPAIR_RESPONSE_${safe.code}`);
    }
  }
  throw lastTerminalError??new Error("GENESIS_G8_MRTI2_REPAIR_TERMINAL_RETRY_LIMIT");
}

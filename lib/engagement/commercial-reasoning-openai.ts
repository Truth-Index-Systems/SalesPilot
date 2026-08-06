import "server-only";
import { completeAiRequest, reserveAiRequest, responseUsage } from "@/lib/ai/governance";
import { resolveOpenAIModel } from "@/lib/intelligence/model-router";
import { compactForAi, stableFingerprint } from "@/lib/ai/cost-optimisation";
import { parseStructuredAiResponse, safeStructuredAiError } from "@/lib/ai/structured-response-gateway";
import { CommercialReasoningSchema, commercialReasoningJsonSchema, type CommercialReasoning } from "./commercial-reasoning-schema";

const ENDPOINT="https://api.openai.com/v1/responses";
export async function reasonAboutEngagement(input:{organisationId:string;campaignId:string;schedulerRunId:string;analysisId:string;context:Record<string,unknown>}):Promise<{result:CommercialReasoning;model:string}>{
  const apiKey=process.env.OPENAI_API_KEY?.trim(); if(!apiKey) throw new Error("OPENAI_API_KEY_NOT_CONFIGURED");
  const model=resolveOpenAIModel("analysis").model; const compactContext=compactForAi(input.context,{evidenceLimit:6,depth:6}) as Record<string,unknown>; const fingerprint=stableFingerprint({prompt:"commercial-reasoning/v2-route-strategy",model,compactContext}); const startedAt=Date.now();
  const reservation=await reserveAiRequest({organisationId:input.organisationId,campaignId:input.campaignId,schedulerRunId:input.schedulerRunId,jobType:"COMMERCIAL_REASONING",jobId:input.analysisId,requestScope:`commercial-reasoning:${fingerprint}`,model,estimatedCostUsd:Number(process.env.SALESPILOT_COMMERCIAL_REASONING_ESTIMATED_COST_USD??"0.08")});
  let response:Response;
  try{response=await fetch(ENDPOINT,{method:"POST",cache:"no-store",signal:AbortSignal.timeout(120_000),headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model,instructions:[
    "You are SalesPilot Engagement Intelligence. Think like an exceptional enterprise salesperson before any outreach is written.",
    "Determine the strongest evidence-backed commercial angle for winning a conversation through the recommended access route.",
    "Treat access strategy as a first-class decision. Use the supplied Best Access Route, Route Quality, Route Confidence and Recommended Entry Strategy to decide how the conversation should begin.",
    "Explain why the route is commercially sensible, how authority and accessibility affect the approach, and provide a realistic fallback path.",
    "Do not default to seniority alone: the strongest route is the one most likely to create a credible conversation.",
    "Use only facts and evidence supplied in the input. Never invent company facts, personal information, current initiatives, budgets, pain, urgency or relationships.",
    "Separate supported facts from reasonable commercial inference. Put every weakness or unsupported assumption in limitations.",
    "Evidence references must point to source IDs supplied in the input. Do not create IDs.",
    "The CTA strategy should seek a low-friction business conversation, not claim a sale or guaranteed result.",
    "Return exact JSON only in calm British English. Do not write the outreach message in this phase."
  ].join(" "),input:JSON.stringify(compactContext),text:{format:{type:"json_schema",name:"salespilot_commercial_reasoning_v2_route_strategy",strict:true,schema:commercialReasoningJsonSchema}},max_output_tokens:2600,store:false})});}
  catch(error){await completeAiRequest({ledgerId:reservation.ledgerId,ok:false,durationMs:Date.now()-startedAt,errorCode:"NETWORK",errorMessage:error instanceof Error?error.message:"OpenAI request failed"}).catch(()=>undefined);throw error;}
  const json:unknown=await response.json().catch(()=>null);
  if(!response.ok){await completeAiRequest({ledgerId:reservation.ledgerId,ok:false,usage:responseUsage(json),durationMs:Date.now()-startedAt,responseId:typeof (json as any)?.id==="string"?(json as any).id:null,errorCode:`HTTP_${response.status}`,errorMessage:JSON.stringify((json as any)?.error??null)}).catch(()=>undefined);throw new Error(`OPENAI_COMMERCIAL_REASONING_FAILED:${response.status}`);}
  let parsed:CommercialReasoning; try{parsed=(await parseStructuredAiResponse({response:json,schema:CommercialReasoningSchema,jsonSchema:commercialReasoningJsonSchema,schemaName:"salespilot_commercial_reasoning_v2_route_strategy",apiKey,model})).value;}catch(error){const safe=safeStructuredAiError(error);await completeAiRequest({ledgerId:reservation.ledgerId,ok:false,usage:responseUsage(json),durationMs:Date.now()-startedAt,errorCode:safe.code,errorMessage:safe.message}).catch(()=>undefined);throw error;}
  await completeAiRequest({ledgerId:reservation.ledgerId,ok:true,usage:responseUsage(json),durationMs:Date.now()-startedAt,responseId:typeof (json as any)?.id==="string"?(json as any).id:null}); return {result:parsed,model};
}

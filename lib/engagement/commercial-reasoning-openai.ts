import "server-only";
import { completeAiRequest, reserveAiRequest, responseUsage } from "@/lib/ai/governance";
import { resolveOpenAIModel } from "@/lib/intelligence/model-router";
import { CommercialReasoningSchema, commercialReasoningJsonSchema, type CommercialReasoning } from "./commercial-reasoning-schema";

const ENDPOINT="https://api.openai.com/v1/responses";
function outputText(value:unknown){const data=value as {output_text?:unknown;output?:Array<{content?:Array<{text?:unknown}>}>};if(typeof data.output_text==="string"&&data.output_text)return data.output_text;for(const item of data.output??[])for(const part of item.content??[])if(typeof part.text==="string")return part.text;throw new Error("COMMERCIAL_REASONING_RESPONSE_EMPTY");}

export async function reasonAboutEngagement(input:{organisationId:string;campaignId:string;schedulerRunId:string;analysisId:string;context:Record<string,unknown>}):Promise<{result:CommercialReasoning;model:string}>{
  const apiKey=process.env.OPENAI_API_KEY?.trim(); if(!apiKey) throw new Error("OPENAI_API_KEY_NOT_CONFIGURED");
  const model=resolveOpenAIModel("analysis").model; const startedAt=Date.now();
  const reservation=await reserveAiRequest({organisationId:input.organisationId,campaignId:input.campaignId,schedulerRunId:input.schedulerRunId,jobType:"COMMERCIAL_REASONING",jobId:input.analysisId,requestScope:`commercial-reasoning:${input.analysisId}`,model,estimatedCostUsd:Number(process.env.SALESPILOT_COMMERCIAL_REASONING_ESTIMATED_COST_USD??"0.08")});
  let response:Response;
  try{response=await fetch(ENDPOINT,{method:"POST",cache:"no-store",signal:AbortSignal.timeout(120_000),headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model,instructions:[
    "You are SalesPilot Engagement Intelligence. Think like an exceptional enterprise salesperson before any outreach is written.",
    "Determine the strongest evidence-backed commercial angle for winning a conversation with the supplied buyer.",
    "Use only facts and evidence supplied in the input. Never invent company facts, personal information, current initiatives, budgets, pain, urgency or relationships.",
    "Separate supported facts from reasonable commercial inference. Put every weakness or unsupported assumption in limitations.",
    "Evidence references must point to source IDs supplied in the input. Do not create IDs.",
    "The CTA strategy should seek a low-friction business conversation, not claim a sale or guaranteed result.",
    "Return exact JSON only in calm British English. Do not write the outreach message in this phase."
  ].join(" "),input:JSON.stringify(input.context),text:{format:{type:"json_schema",name:"salespilot_commercial_reasoning_v1",strict:true,schema:commercialReasoningJsonSchema}},max_output_tokens:4500,store:false})});}
  catch(error){await completeAiRequest({ledgerId:reservation.ledgerId,ok:false,durationMs:Date.now()-startedAt,errorCode:"NETWORK",errorMessage:error instanceof Error?error.message:"OpenAI request failed"}).catch(()=>undefined);throw error;}
  const json:unknown=await response.json().catch(()=>null);
  if(!response.ok){await completeAiRequest({ledgerId:reservation.ledgerId,ok:false,usage:responseUsage(json),durationMs:Date.now()-startedAt,responseId:typeof (json as any)?.id==="string"?(json as any).id:null,errorCode:`HTTP_${response.status}`,errorMessage:JSON.stringify((json as any)?.error??null)}).catch(()=>undefined);throw new Error(`OPENAI_COMMERCIAL_REASONING_FAILED:${response.status}`);}
  let parsed:CommercialReasoning; try{parsed=CommercialReasoningSchema.parse(JSON.parse(outputText(json)));}catch(error){await completeAiRequest({ledgerId:reservation.ledgerId,ok:false,usage:responseUsage(json),durationMs:Date.now()-startedAt,errorCode:"INVALID_STRUCTURED_OUTPUT",errorMessage:error instanceof Error?error.message:"Invalid output"}).catch(()=>undefined);throw error;}
  await completeAiRequest({ledgerId:reservation.ledgerId,ok:true,usage:responseUsage(json),durationMs:Date.now()-startedAt,responseId:typeof (json as any)?.id==="string"?(json as any).id:null}); return {result:parsed,model};
}

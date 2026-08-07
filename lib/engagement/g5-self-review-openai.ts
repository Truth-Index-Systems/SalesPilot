import "server-only";
import { completeAiRequest, reserveAiRequest, responseUsage } from "@/lib/ai/governance";
import { compactForAi, stableFingerprint } from "@/lib/ai/cost-optimisation";
import { parseStructuredAiResponse, safeStructuredAiError } from "@/lib/ai/structured-response-gateway";
import { resolveOpenAIModel } from "@/lib/intelligence/model-router";
import { G5SelfReviewSchema, g5SelfReviewJsonSchema, type G5SelfReview } from "./g5-self-review-schema";

const ENDPOINT = "https://api.openai.com/v1/responses";

function applyPolicy(review: G5SelfReview, rewriteCount: number): G5SelfReview {
  const hardBlock = review.unsupportedClaims.length > 0 || review.factualAccuracy < 70 || review.evidenceAlignment < 70 || review.routeAlignment < 70 || review.hallucinationRisk < 60;
  const pass = !hardBlock && review.factualAccuracy >= 90 && review.evidenceAlignment >= 85 && review.routeAlignment >= 90 && review.hallucinationRisk >= 85 && review.overallConfidence >= 80 && review.spamCharacteristics >= 70 && review.overclaiming >= 80;
  let outcome: G5SelfReview["outcome"] = pass ? "PASS" : "REWRITE";
  if (!pass && rewriteCount >= 2) outcome = "BLOCK";
  if (review.outcome === "BLOCK" && review.blockedReasons.length > 0) outcome = "BLOCK";
  return { ...review, outcome };
}

export async function reviewG5Outreach(input:{organisationId:string;campaignId:string;schedulerRunId:string;strategyId:string;rewriteCount:number;context:Record<string,unknown>}):Promise<{result:G5SelfReview;model:string;sourceFingerprint:string}> {
  const apiKey=process.env.OPENAI_API_KEY?.trim(); if(!apiKey) throw new Error("OPENAI_API_KEY_NOT_CONFIGURED");
  const model=resolveOpenAIModel("analysis").model;
  const compactInput=compactForAi(input.context,{evidenceLimit:10,depth:8}) as Record<string,unknown>;
  const sourceFingerprint=stableFingerprint(compactInput);
  const requestFingerprint=stableFingerprint({prompt:"g5-self-review/v2-chief-revenue-risk",model,sourceFingerprint,rewriteCount:input.rewriteCount});
  const startedAt=Date.now();
  const reservation=await reserveAiRequest({organisationId:input.organisationId,campaignId:input.campaignId,schedulerRunId:input.schedulerRunId,jobType:"OUTREACH",jobId:input.strategyId,requestScope:`g5-self-review:${requestFingerprint}`,model,estimatedCostUsd:Number(process.env.SALESPILOT_ENGAGEMENT_SELF_REVIEW_ESTIMATED_COST_USD??"0.04")});
  let response:Response;
  try {
    response=await fetch(ENDPOINT,{method:"POST",cache:"no-store",signal:AbortSignal.timeout(120_000),headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model,instructions:[
      "ROLE: Chief Revenue Risk & Quality Officer for SalesPilot. You are independent from the writer and are expected to be adversarial when credibility is at risk.",
      "MISSION: Prevent any outreach from progressing if it could waste the account, damage the sender's reputation, misstate evidence or feel like low-quality automated prospecting.",
      "DECISION STANDARD: Ask 'If this went to our most valuable prospect and their CEO later showed it to me, could I defend every sentence and the judgement behind sending it?'",
      "BUYER SIMULATION: Read the message as the actual recipient with roughly nine seconds of attention, no relationship with the sender and many competing messages. Identify what would cause immediate deletion, scepticism or irritation.",
      "THREE GATES: (1) TRUTH - factual accuracy, evidence alignment, no unsupported pain/urgency/results/budget. (2) SALES - relevance, route fit, commercial clarity, appropriate commitment and reply-worthy CTA. (3) HUMAN - natural language, brevity, no fake intimacy, no AI/marketing voice, no unnecessary adjectives or over-polish.",
      "G4 truth, R2 commercial reasoning, R3 channel strategy and R5 safety are authoritative and immutable. Review the actual R4 outreach only. Do not research, add facts, invent alternatives or change the selected route.",
      "Score factual accuracy, evidence alignment, route alignment, hallucination safety, tone, length, commercial clarity, CTA quality, spam characteristics, overclaiming and personalisation relevance. For hallucinationRisk, spamCharacteristics and overclaiming, higher means safer/better.",
      "PASS only when the message is both safe AND commercially strong. Accuracy alone is insufficient. REWRITE when the same truth and route can produce a materially better message. BLOCK when the basis/message is unsafe or repeated rewrites cannot responsibly progress.",
      "List every unsupported claim. Criticism must be specific, prioritised and decision-useful. Rewrite instructions must tell the Executive Communications Director exactly what to remove, preserve or change without adding facts.",
      "Do not reward verbosity or polish for their own sake. Reward credible relevance, restraint and a sensible next commitment.",
      "Return exact JSON only. Set promptVersion to g5-self-review/v2-chief-revenue-risk."
    ].join(" "),input:JSON.stringify(compactInput),reasoning:{effort:"high"},text:{format:{type:"json_schema",name:"salespilot_g5_self_review_v1",strict:true,schema:g5SelfReviewJsonSchema}},max_output_tokens:1800,store:false})});
  } catch(error){await completeAiRequest({ledgerId:reservation.ledgerId,ok:false,durationMs:Date.now()-startedAt,errorCode:"NETWORK",errorMessage:error instanceof Error?error.message:"OpenAI request failed"}).catch(()=>undefined);throw error;}
  const json:unknown=await response.json().catch(()=>null); const usage=responseUsage(json); const responseId=typeof (json as {id?:unknown}|null)?.id==="string"?(json as {id:string}).id:null;
  if(!response.ok){await completeAiRequest({ledgerId:reservation.ledgerId,ok:false,usage,durationMs:Date.now()-startedAt,responseId,errorCode:`HTTP_${response.status}`,errorMessage:JSON.stringify((json as {error?:unknown}|null)?.error??null)}).catch(()=>undefined);throw new Error(`OPENAI_G5_SELF_REVIEW_FAILED:${response.status}`);}
  let parsed:G5SelfReview;
  try{parsed=(await parseStructuredAiResponse({response:json,schema:G5SelfReviewSchema,jsonSchema:g5SelfReviewJsonSchema,schemaName:"salespilot_g5_self_review_v1",apiKey,model})).value;}catch(error){const safe=safeStructuredAiError(error);await completeAiRequest({ledgerId:reservation.ledgerId,ok:false,usage,durationMs:Date.now()-startedAt,responseId,errorCode:safe.code,errorMessage:safe.message}).catch(()=>undefined);throw error;}
  const result=applyPolicy(parsed,input.rewriteCount);
  await completeAiRequest({ledgerId:reservation.ledgerId,ok:true,usage,durationMs:Date.now()-startedAt,responseId});
  return {result,model,sourceFingerprint};
}

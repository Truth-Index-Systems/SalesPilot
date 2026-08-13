import "server-only";
import { discardOpenAIBackgroundResponse, fetchResumableOpenAIResponse, isOpenAIBackgroundPending } from "@/lib/ai/background-response";
import { aiRequestTimeoutMs, classifyOpenAITransportError } from "@/lib/ai/request-policy";
import { aiWorkloadProfile, aiPromptCacheKey } from "@/lib/ai/workload-profile";
import { completeAiRequest, reserveAiRequest, responseUsage } from "@/lib/ai/governance";
import { compactG5SelfReviewBrief, stableFingerprint } from "@/lib/ai/cost-optimisation";
import { parseStructuredAiResponse, safeStructuredAiError } from "@/lib/ai/structured-response-gateway";
import { resolveOpenAIModel } from "@/lib/intelligence/model-router";
import { G5SelfReviewSchema, g5SelfReviewJsonSchema, type G5SelfReview } from "./g5-self-review-schema";
import { applyG5CategoricalReviewPolicy, MARKETROUTE_FB8_G5_SELF_REVIEW_PROMPT_VERSION } from "./g5-self-review-policy";

const ENDPOINT = "https://api.openai.com/v1/responses";

function applyPolicy(review: G5SelfReview, rewriteCount: number): G5SelfReview {
  return applyG5CategoricalReviewPolicy(review, rewriteCount);
}


export async function reviewG5Outreach(input:{organisationId:string;campaignId:string;schedulerRunId:string;strategyId:string;rewriteCount:number;context:Record<string,unknown>}):Promise<{result:G5SelfReview;model:string;sourceFingerprint:string}> {
  const apiKey=process.env.OPENAI_API_KEY?.trim(); if(!apiKey) throw new Error("OPENAI_API_KEY_NOT_CONFIGURED");
  const model=resolveOpenAIModel("analysis").model; const profile=aiWorkloadProfile("G5_SELF_REVIEW");
  const compactInput=compactG5SelfReviewBrief({
    commercialReasoning:(input.context.commercialReasoning as Record<string,unknown>)??{},
    channelStrategy:(input.context.channelStrategy as Record<string,unknown>)??{},
    immutableG4:(input.context.immutableG4 as Record<string,unknown>)??{},
    personalisationSafety:(input.context.personalisationSafety as Record<string,unknown>)??{},
    outreach:(input.context.outreach as Record<string,unknown>)??{},
    rewriteCount:input.rewriteCount,
  },{evidenceLimit:profile.evidenceLimit,depth:profile.depth}) as Record<string,unknown>;
  const sourceFingerprint=stableFingerprint(compactInput);
  const requestFingerprint=stableFingerprint({prompt:profile.promptVersion,cacheKey:aiPromptCacheKey("G5_SELF_REVIEW"),model,sourceFingerprint,rewriteCount:input.rewriteCount});
  const startedAt=Date.now();
  const requestTimeoutMs = aiRequestTimeoutMs("G5_SELF_REVIEW");
  const reservation=await reserveAiRequest({organisationId:input.organisationId,campaignId:input.campaignId,schedulerRunId:input.schedulerRunId,jobType:"OUTREACH",jobId:input.strategyId,requestScope:`g5-self-review:${requestFingerprint}`,model,estimatedCostUsd:Number(process.env.SALESPILOT_ENGAGEMENT_SELF_REVIEW_ESTIMATED_COST_USD??"0.04")});
  let response:Response;
  try {
    response=await fetchResumableOpenAIResponse({ apiKey, task: "G5_SELF_REVIEW", organisationId: input.organisationId, campaignId: input.campaignId, jobType: "OUTREACH", jobId: input.strategyId, requestScope: `g5-self-review:${requestFingerprint}`, model, ledgerId: reservation.ledgerId },{method:"POST",cache:"no-store",signal:AbortSignal.timeout(requestTimeoutMs),headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model,instructions:[
      "ROLE: Chief Revenue Risk & Quality Officer for MarketRoute. You are independent from the writer and are expected to be adversarial when credibility is at risk.",
      "MISSION: Independently classify whether the outreach is safe and commercially strong enough to progress, and give precise evidence for that assessment. You are an auditor; deterministic MarketRoute enforces unsupported/blocked findings, rewrite limits and current CIE authority.",
      "ACCOUNTABLE FOR: Adversarial assessment of factual integrity, evidence use, route alignment, buyer relevance, human quality, CTA quality, overclaiming, spam characteristics and specific rewrite guidance.",
      "QUALITY BOUNDARY: Your PASS/REWRITE/BLOCK field is the categorical semantic quality finding. Numeric 0-100 scores are diagnostic telemetry only and never decide workflow state. You do NOT change state, approve outreach, select another route, generate replacement copy, set the rewrite limit, queue or send. MarketRoute deterministically enforces unsupported/blocked findings, rewrite limits and current R4/R5/R6 authority.",
      "OUT OF SCOPE / HAND OFF: Do not research, repair upstream strategy, choose a different buyer/channel or write the replacement message. If the upstream basis itself appears weak, identify the precise problem in criticism/blockedReasons; do not invent a better basis.",
      "DECISION STANDARD: Ask 'If this went to our most valuable prospect and their CEO later showed it to me, could I defend every sentence and the judgement behind sending it?'",
      "BUYER SIMULATION: Read the message as the actual recipient with roughly nine seconds of attention, no relationship with the sender and many competing messages. Identify what would cause immediate deletion, scepticism or irritation.",
      "THREE GATES: (1) TRUTH - factual accuracy, evidence alignment, no unsupported pain/urgency/results/budget. (2) SALES - relevance, route fit, commercial clarity, appropriate commitment and reply-worthy CTA. (3) HUMAN - natural language, brevity, no fake intimacy, no AI/marketing voice, no unnecessary adjectives or over-polish.",
      "G4 truth, R2 commercial reasoning, R3 channel strategy and R5 safety are authoritative and immutable. Review the actual R4 outreach only. Do not research, add facts, invent alternatives or change the selected route.",
      "Score factual accuracy, evidence alignment, route alignment, hallucination safety, tone, length, commercial clarity, CTA quality, spam characteristics, overclaiming and personalisation relevance for diagnostics only. Do not use a numeric threshold to determine outcome. For hallucinationRisk, spamCharacteristics and overclaiming, higher means safer/better.",
      "Set PASS only when the message is both safe AND commercially strong and unsupportedClaims/blockedReasons are empty. Set REWRITE when the same truth and route can produce a materially better message. Set BLOCK when progression itself is unsafe. MarketRoute enforces the rewrite limit and all execution authority independently.",
      "List every unsupported claim. Criticism must be specific, prioritised and decision-useful. Rewrite instructions must tell the Executive Communications Director exactly what to remove, preserve or change without adding facts.",
      "Do not reward verbosity or polish for their own sake. Reward credible relevance, restraint and a sensible next commitment.",
      "Everything outside your accountability belongs to another executive or deterministic MarketRoute. Do not assume another role merely to complete the task.",
      `Return exact JSON only. Set promptVersion to ${MARKETROUTE_FB8_G5_SELF_REVIEW_PROMPT_VERSION}.`
    ].join(" "),input:JSON.stringify(compactInput),reasoning:{effort:profile.reasoningEffort},text:{format:{type:"json_schema",name:"salespilot_g5_self_review_v1",strict:true,schema:g5SelfReviewJsonSchema}},max_output_tokens:profile.maxOutputTokens,store:false})});
  } catch(error){if(isOpenAIBackgroundPending(error))throw error;const transport=classifyOpenAITransportError(error,"G5_SELF_REVIEW",requestTimeoutMs);await completeAiRequest({ledgerId:reservation.ledgerId,ok:false,durationMs:Date.now()-startedAt,errorCode:transport.code,errorMessage:transport.error.message}).catch(()=>undefined);throw transport.error;}
  const json:unknown=await response.json().catch(()=>null); const usage=responseUsage(json); const responseId=typeof (json as {id?:unknown}|null)?.id==="string"?(json as {id:string}).id:null;
  if(!response.ok){await completeAiRequest({ledgerId:reservation.ledgerId,ok:false,usage,durationMs:Date.now()-startedAt,responseId,errorCode:`HTTP_${response.status}`,errorMessage:JSON.stringify((json as {error?:unknown}|null)?.error??null)}).catch(()=>undefined);throw new Error(`OPENAI_G5_SELF_REVIEW_FAILED:${response.status}`);}
  let parsed:G5SelfReview;
  try{parsed=(await parseStructuredAiResponse({response:json,schema:G5SelfReviewSchema,jsonSchema:g5SelfReviewJsonSchema,schemaName:"salespilot_g5_self_review_v1",apiKey,model})).value;}catch(error){await discardOpenAIBackgroundResponse({organisationId:input.organisationId,campaignId:input.campaignId,jobType:"OUTREACH",jobId:input.strategyId,requestScope:`g5-self-review:${requestFingerprint}`}).catch(()=>undefined);const safe=safeStructuredAiError(error);await completeAiRequest({ledgerId:reservation.ledgerId,ok:false,usage,durationMs:Date.now()-startedAt,responseId,errorCode:safe.code,errorMessage:safe.message}).catch(()=>undefined);throw error;}
  const result=applyPolicy(parsed,input.rewriteCount);
  await completeAiRequest({ledgerId:reservation.ledgerId,ok:true,usage,durationMs:Date.now()-startedAt,responseId});
  return {result,model,sourceFingerprint};
}

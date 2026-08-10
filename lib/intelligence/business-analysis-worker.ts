import "server-only";
import { analyseBusinessCore, analyseBusinessGrowth } from "@/lib/intelligence/openai";
import { assembleBusinessAnalysis, CoreBusinessDnaEnvelopeSchema } from "@/lib/intelligence/business-analysis-decomposition";
import { readWebsite, WebsiteReadError } from "@/lib/intelligence/website-reader";
import { claimBusinessAnalysisJob, completeBusinessAnalysisG8Match, completeBusinessAnalysisJob, deferBusinessAnalysisBackground, failBusinessAnalysisG8Match, failBusinessAnalysisJob, persistBusinessAnalysisCore, startBusinessAnalysisG8Match, updateBusinessAnalysisProgress } from "@/lib/intelligence/business-analysis-jobs";
import { StructuredAiOutputError } from "@/lib/ai/structured-response-gateway";
import { isPipelineOwnershipLost } from "@/lib/pipeline/ownership";
import { isOpenAIBackgroundPending } from "@/lib/ai/background-response";
import { GENESIS_G8_BUSINESS_DNA_MATCHING_VERSION, isGenesisG8BusinessDnaKnowledgeMatchingEnabled, matchBusinessDnaAgainstGenesisG8, withGenesisG8BusinessDnaMatchBudget } from "@/lib/genesis-g8/business-dna-knowledge-matching";
import { enterMarketRouteSellerUnderstanding } from "@/lib/integrations/genesis-t8/marketroute-seller-entry";

function classify(error:unknown){
  if(error instanceof WebsiteReadError){
    const retryable=["WEBSITE_TIMEOUT","WEBSITE_UNAVAILABLE"].includes(error.code);
    return {code:error.code,message:retryable?"The public website could not be read completely. This analysis can retry safely.":"The supplied website could not be verified as a supported public source.",retryable};
  }
  if(error instanceof StructuredAiOutputError)return {code:"INVALID_AI_OUTPUT",message:error.safeMessage,retryable:true};
  const message=error instanceof Error?error.message:"";
  if(/429|rate limit/i.test(message))return {code:"RATE_LIMIT",message:"The AI provider temporarily rate-limited this request. This analysis can retry safely.",retryable:true};
  if(/timeout|abort/i.test(message))return {code:"TIMEOUT",message:"An external research request timed out. This analysis can retry safely.",retryable:true};
  if(/AI_GOVERNANCE_BLOCKED/i.test(message)){
    const reason=["PLATFORM_DISABLED","AUTONOMY_DISABLED","PUBLIC_DAILY_REQUEST_LIMIT","PUBLIC_DAILY_COST_LIMIT","REQUEST_LIMIT","COST_LIMIT","CAMPAIGN_LIMIT"].find(value=>message.includes(value))??"LIMIT_REACHED";
    return {code:"AI_GOVERNANCE_BLOCKED",message:`AI_GOVERNANCE_BLOCKED:${reason}`,retryable:true};
  }
  if(/not configured|authentication|401/i.test(message))return {code:"CONFIGURATION",message:"The protected AI service configuration is incomplete.",retryable:false};
  if(/STRUCTURED_AI_OUTPUT|JSON|structured output|invalid response|unterminated string|unexpected end/i.test(message))return {code:"INVALID_AI_OUTPUT",message:"MarketRoute received an incomplete structured response. This stage can be retried safely.",retryable:true};
  return {code:"ANALYSIS_FAILED",message:"Business analysis encountered a technical interruption. No partial result was exposed.",retryable:true};
}

export async function runBusinessAnalysisJob(id:string,token:string){
  const job=await claimBusinessAnalysisJob(id,token);
  if(!job)return {claimed:false as const};
  if(typeof job.website_input!=="string"||!job.website_input.trim()||!job.worker_token)return {claimed:false as const};
  const workerToken=job.worker_token;
  const started=Date.now();
  try{
    const publicAnalysis=job.requested_by===null;
    let core=job.core_analysis_json?CoreBusinessDnaEnvelopeSchema.parse(job.core_analysis_json):null;
    let canonicalUrl=job.canonical_url;
    let pagesRead=job.pages_read??0;

    if(!core){
      const website=await readWebsite(job.website_input,{
        onHomepageReady: async homepage => {
          canonicalUrl=homepage.url;
          pagesRead=1;
          await updateBusinessAnalysisProgress(id,token,workerToken,"WEBSITE_CONNECTED",14,homepage.url,1);
        },
      });
      canonicalUrl=website.canonicalUrl;pagesRead=website.sources.length;
      await updateBusinessAnalysisProgress(id,token,workerToken,"BUILDING_BUSINESS_DNA",20,canonicalUrl,pagesRead);
      core=await analyseBusinessCore({organisationId:job.organisation_id,publicAnalysis:job.requested_by===null,jobId:job.id,website:canonicalUrl,sources:website.sources});
      await persistBusinessAnalysisCore(id,token,workerToken,canonicalUrl,pagesRead,core);
    }

    if(!core)throw new Error("BUSINESS_DNA_CHECKPOINT_MISSING");
    const finalCore=core;
    const finalUrl=canonicalUrl??finalCore.payload.company.website;
    await updateBusinessAnalysisProgress(id,token,workerToken,"GROWTH_STRATEGY_RUNNING",72,finalUrl,pagesRead);
    const growth=await analyseBusinessGrowth({organisationId:job.organisation_id,publicAnalysis:job.requested_by===null,jobId:job.id,website:finalUrl,core:finalCore});
    await updateBusinessAnalysisProgress(id,token,workerToken,"PREPARING_RECOMMENDATIONS",92,finalUrl,pagesRead);
    const analysis=assembleBusinessAnalysis(finalCore,growth);

    // MR-R1 Build 1: all completed seller understanding now crosses the Genesis
    // T8 entry boundary before any downstream MarketRoute stage can consume it.
    // This build is intentionally compatibility-preserving: Genesis validates
    // the AI-produced seller understanding and prepares its canonical research
    // surface, while the legacy Business DNA payload remains byte-for-byte
    // equivalent for existing discovery/UI consumers.
    const genesisSellerEntry=enterMarketRouteSellerUnderstanding(analysis);
    const genesisAnalysis={...analysis,payload:genesisSellerEntry.legacyBusinessDna};

    // R14 activation boundary: ask accumulated Knowledge Intelligence before the
    // analysis is exposed, but never make first-time Business DNA depend on it.
    // A completed match is durable and reused across worker retries. The bounded
    // DB-only lookup is fail-open: legacy Discovery remains the universal path.
    if (isGenesisG8BusinessDnaKnowledgeMatchingEnabled() && job.genesis_g8_match_status !== "COMPLETED") {
      try {
        await startBusinessAnalysisG8Match(id,token,workerToken,GENESIS_G8_BUSINESS_DNA_MATCHING_VERSION);
        const match=await withGenesisG8BusinessDnaMatchBudget(matchBusinessDnaAgainstGenesisG8(genesisAnalysis.payload));
        await completeBusinessAnalysisG8Match(id,token,workerToken,GENESIS_G8_BUSINESS_DNA_MATCHING_VERSION,match);
      } catch (matchError) {
        if (isPipelineOwnershipLost(matchError)) throw matchError;
        console.warn("Genesis G8 Business DNA knowledge match unavailable; continuing with Discovery Intelligence",{jobId:id,error:matchError instanceof Error?matchError.message.slice(0,300):"unknown"});
        try {
          await failBusinessAnalysisG8Match(id,token,workerToken,GENESIS_G8_BUSINESS_DNA_MATCHING_VERSION,matchError instanceof Error?matchError.message:"G8_MATCH_FAILED");
        } catch (recordError) {
          if (isPipelineOwnershipLost(recordError)) throw recordError;
          // Migration/configuration absence must never block the legacy path.
          console.warn("Genesis G8 match failure state could not be persisted",{jobId:id});
        }
      }
    }

    await completeBusinessAnalysisJob(id,token,workerToken,finalUrl,pagesRead,genesisAnalysis,Date.now()-started);
    return {claimed:true as const,completed:true as const};
  }catch(error){
    if(isOpenAIBackgroundPending(error)){
      await deferBusinessAnalysisBackground(id,token,workerToken).catch(()=>undefined);
      return {claimed:true as const,completed:false as const,pending:true as const};
    }
    if(isPipelineOwnershipLost(error)){
      console.info("Business analysis worker superseded; stale result discarded",{jobId:id});
      return {claimed:false as const,superseded:true as const};
    }
    const failure=classify(error);
    console.warn("Business analysis job interrupted",{jobId:id,code:failure.code,retryable:failure.retryable,errorName:error instanceof Error?error.name:typeof error,errorMessage:error instanceof Error?error.message.slice(0,500):"unknown"});
    await failBusinessAnalysisJob(id,token,workerToken,failure.code,failure.message,failure.retryable);
    return {claimed:true as const,completed:false as const,failure};
  }
}

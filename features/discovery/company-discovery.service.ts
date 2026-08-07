import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";
import { discoverCompanies } from "@/lib/discovery/openai";
import { buildCompanySearchPlan } from "@/lib/discovery/search-plan";
import { verifyDiscoveredCompanyDetailed, type CompanyVerificationReason } from "@/lib/discovery/site-verifier";
import type { WorkerExecutionContext, WorkerExecutionResult } from "@/lib/pipeline/executor";
import { classifyPipelineError } from "@/lib/pipeline/errors";
import { createResultSummary } from "@/lib/pipeline/result-summary";
import { safePipelineFailureReason } from "@/lib/pipeline/safe-error";
import { isPipelineOwnershipLost } from "@/lib/pipeline/ownership";
import { aiGovernanceBlockReason } from "@/lib/ai/governance";

function safeWorkerError(error: unknown): string {
  return safePipelineFailureReason(error, "Company Discovery encountered a technical interruption and will retry safely.");
}

async function activity(sessionId:string,schedulerRunId:string,type:string,title:string,description?:string,metadata:Record<string,unknown>={}) {
  try {
    await databaseRequest("rpc/record_discovery_activity_owned", {method:"POST",body:JSON.stringify({p_session_id:sessionId,p_scheduler_run_id:schedulerRunId,p_activity_type:type,p_title:title,p_description:description??null,p_metadata:metadata})});
  } catch (error) {
    // Observability is best-effort. A timeline/ticker write must never fail the
    // deterministic planning phase or discard otherwise valid discovery work.
    console.error("Discovery activity write failed", { sessionId, type, error });
  }
}

export async function runNextCompanyDiscovery(context: WorkerExecutionContext): Promise<WorkerExecutionResult> {
  const startedAt = Date.now();
  const claimed = await databaseRequest<Array<{ session_id: string; organisation_id: string; campaign_id: string }>>("rpc/claim_company_discovery_owned",{ method: "POST", body: JSON.stringify({ p_scheduler_run_id: context.schedulerRunId }) });
  const job = claimed[0];
  if (!job) return { worker: "COMPANY_DISCOVERY", processed: false, outcome: "NO_JOB" };
  let failurePhase = "PREPARING";
  try {
    const sessionRows = await databaseRequest<Array<{ expansion_pass_count?: number | null; minimum_supported_companies?: number | null; max_expansion_passes?: number | null }>>(
      `discovery_sessions?id=eq.${job.session_id}&organisation_id=eq.${job.organisation_id}&select=expansion_pass_count,minimum_supported_companies,max_expansion_passes&limit=1`
    );
    const expansionPassCount = Number(sessionRows[0]?.expansion_pass_count ?? 0);
    const searchPass = expansionPassCount + 1;
    const minimumSupportedCompanies = Number(sessionRows[0]?.minimum_supported_companies ?? 3);
    const maxExpansionPasses = Number(sessionRows[0]?.max_expansion_passes ?? 6);
    const searchStrategies = [
      "EXACT_INDUSTRY",
      "ADJACENT_INDUSTRIES",
      "OPERATIONAL_SIMILARITY",
      "PROBLEM_SIMILARITY",
      "BUYER_SIMILARITY",
      "COMPANY_ECOSYSTEM",
    ] as const;
    const searchStrategy = searchStrategies[Math.min(expansionPassCount, searchStrategies.length - 1)];
    await activity(
      job.session_id,
      context.schedulerRunId,
      searchPass > 1 ? "DISCOVERY_EXPANSION_STARTED" : "DISCOVERY_STARTED",
      searchPass > 1 ? `Expanding company search · pass ${searchPass}` : "Company discovery started",
      searchPass > 1
        ? "SalesPilot is exploring another evidence-backed commercial angle because the earlier search retained too few strong matches."
        : "SalesPilot is preparing a search from the approved campaign.",
      { searchPass, searchStrategy, minimumSupportedCompanies, maxExpansionPasses },
    );
    const campaigns = await databaseRequest<any[]>(`campaign_detail?id=eq.${job.campaign_id}&organisation_id=eq.${job.organisation_id}&limit=1`);
    const campaign = campaigns[0];
    if (!campaign) throw new Error("CAMPAIGN_NOT_FOUND");
    const campaignRows = await databaseRequest<any[]>(`campaigns?id=eq.${job.campaign_id}&organisation_id=eq.${job.organisation_id}&limit=1&select=business_profile_id`);
    const profileId = campaignRows[0]?.business_profile_id;
    if (!profileId) throw new Error("BUSINESS_PROFILE_NOT_FOUND");
    const profiles = await databaseRequest<any[]>(`business_profile_versions?business_profile_id=eq.${profileId}&organisation_id=eq.${job.organisation_id}&order=version_number.desc&limit=1&select=payload_json`);
    const business = profiles[0]?.payload_json ?? { name: campaign.business_name, summary: campaign.business_summary, website: campaign.website_url };

    await activity(job.session_id,context.schedulerRunId,"SEARCH_PREPARED","Approved strategy verified","The audience, buyer roles and commercial angle are ready for company research.");
    failurePhase = "PLANNING";
    await databaseRequest("rpc/update_company_discovery_progress_owned",{method:"POST",body:JSON.stringify({p_session_id:job.session_id,p_scheduler_run_id:context.schedulerRunId,p_stage:"PLANNING",p_progress:28})});
    await activity(job.session_id,context.schedulerRunId,"SEARCH_PLAN_STARTED","Building the market search plan","SalesPilot is deterministically translating the approved campaign into operational conditions, company archetypes and high-value evidence sources before any external research begins.",{searchPass,searchStrategy});
    const searchPlan = await buildCompanySearchPlan({
      organisationId: job.organisation_id,
      campaignId: job.campaign_id,
      schedulerRunId: context.schedulerRunId,
      jobId: job.session_id,
      campaign:{name:campaign.name,objective:campaign.objective,audience:campaign.audience,buyerRoles:campaign.buyer_roles,messageAngle:campaign.message_angle,why:campaign.why,fitScore:campaign.fit_score},
      business,
      customerWebsite:campaign.website_url,
      searchPass,
      searchStrategy,
    });
    await activity(job.session_id,context.schedulerRunId,"SEARCH_PLAN_READY","Market search plan ready",`${searchPlan.companyArchetypes.length} company archetypes will be researched before the evidence gate is applied.`,{
      commercialProblem:searchPlan.commercialProblem,
      operationalConditions:searchPlan.operationalConditions,
      archetypes:searchPlan.companyArchetypes.map(item=>item.name),
      sourcePriority:searchPlan.sourcePriority,
    });
    failurePhase = "SEARCHING";
    await databaseRequest("rpc/update_company_discovery_progress_owned",{method:"POST",body:JSON.stringify({p_session_id:job.session_id,p_scheduler_run_id:context.schedulerRunId,p_stage:"SEARCHING",p_progress:40})});
    await activity(job.session_id,context.schedulerRunId,"RESEARCHING","Searching across the planned market space","SalesPilot is researching diverse company archetypes before independently verifying commercial fit and official evidence.");

    const existingCompanies = await databaseRequest<Array<{ company_name: string; canonical_domain: string }>>(
      `companies?organisation_id=eq.${job.organisation_id}&campaign_id=eq.${job.campaign_id}&select=company_name,canonical_domain&limit=1000`
    );
    const result = await discoverCompanies({
      organisationId: job.organisation_id,
      campaignId: job.campaign_id,
      schedulerRunId: context.schedulerRunId,
      jobId: job.session_id,
      campaign:{name:campaign.name,objective:campaign.objective,audience:campaign.audience,buyerRoles:campaign.buyer_roles,messageAngle:campaign.message_angle,why:campaign.why,fitScore:campaign.fit_score},
      business,
      customerWebsite:campaign.website_url,
      excludedCompanies:existingCompanies.map(company=>({name:company.company_name,domain:company.canonical_domain})),
      searchPass,
      searchStrategy,
      searchPlan,
    });

    failurePhase = "VERIFYING";
    await databaseRequest("rpc/update_company_discovery_progress_owned",{method:"POST",body:JSON.stringify({p_session_id:job.session_id,p_scheduler_run_id:context.schedulerRunId,p_stage:"VERIFYING",p_progress:72,p_candidates:result.companies.length})});
    await activity(
      job.session_id,
      context.schedulerRunId,
      "CANDIDATES_FOUND",
      result.companies.length > 0 ? `${result.companies.length} potential matches found` : "Search pass completed",
      result.companies.length > 0
        ? "Each company is now being checked against official-site evidence."
        : "No supported candidates were returned on this pass. SalesPilot will decide whether to expand the search automatically.",
      { candidateCount: result.companies.length, searchPass, searchStrategy },
    );

    let saved=0;
    let verified=0;
    const heldReasons: Record<CompanyVerificationReason, number> = {
      INVALID_DOMAIN: 0,
      HOMEPAGE_UNREACHABLE: 0,
      NO_OFFICIAL_EVIDENCE: 0,
      EVIDENCE_TOO_WEAK: 0,
      CONFIDENCE_TOO_LOW: 0,
    };
    let reachableOfficialEvidence = 0;
    let excerptMatches = 0;
    for (let index=0; index<result.companies.length; index++) {
      const candidate=result.companies[index];
      const validationProgress=73+Math.round(((index+1)/result.companies.length)*12);
      await databaseRequest("rpc/update_company_discovery_progress_owned",{method:"POST",body:JSON.stringify({p_session_id:job.session_id,p_scheduler_run_id:context.schedulerRunId,p_stage:"VERIFYING",p_progress:Math.min(85,validationProgress),p_candidates:result.companies.length})});
      const verification=await verifyDiscoveredCompanyDetailed(candidate);
      reachableOfficialEvidence += verification.diagnostics.officialEvidenceReachable;
      excerptMatches += verification.diagnostics.excerptMatches;
      if (!verification.accepted) {
        heldReasons[verification.reason] += 1;
        await activity(job.session_id,context.schedulerRunId,"CANDIDATE_HELD",`${candidate.name} held back`,"The available official-site evidence was not strong enough to recommend this company.",{companyName:candidate.name,reason:verification.reason,diagnostics:verification.diagnostics});
        continue;
      }
      const company=verification.company;
      verified+=1;
      const saveProgress=86+Math.round((verified/result.companies.length)*9);
      await databaseRequest("rpc/update_company_discovery_progress_owned",{method:"POST",body:JSON.stringify({p_session_id:job.session_id,p_scheduler_run_id:context.schedulerRunId,p_stage:"SAVING",p_progress:Math.min(95,saveProgress),p_candidates:result.companies.length})});
      const count=await databaseRequest<number>("rpc/save_company_discovery_batch_owned",{method:"POST",body:JSON.stringify({p_session_id:job.session_id,p_scheduler_run_id:context.schedulerRunId,p_companies:[company]})});
      saved+=Number(count);
      // COMPANY_VERIFIED quality gate completed before the persisted COMPANY_SAVED activity.
      await activity(job.session_id,context.schedulerRunId,"COMPANY_SAVED",`${company.name} verified and added`,`${company.matchLabel} · ${company.confidence}/100 confidence · ${company.evidenceQuality}/100 evidence quality`,{companyName:company.name,confidence:company.confidence,evidenceQuality:company.evidenceQuality,savedCount:saved});
    }
    const retainedAfterPass = existingCompanies.length + Number(saved);
    const discoverySummary = {
      ...createResultSummary(Number(saved)>0?"COMPLETED_WITH_RESULTS":"COMPLETED_NO_RESULTS",Number(saved),startedAt),
      candidatesReturned: result.companies.length,
      candidatesVerified: verified,
      candidatesHeld: result.companies.length - verified,
      reachableOfficialEvidence,
      excerptMatches,
      heldReasons,
      searchPass,
      searchStrategy,
      searchPlanSummary: {
        commercialProblem: searchPlan.commercialProblem,
        archetypes: searchPlan.companyArchetypes.map(item=>item.name),
        operationalConditions: searchPlan.operationalConditions,
        sourcePriority: searchPlan.sourcePriority,
      },
      retainedAfterPass,
      minimumSupportedCompanies,
      maxExpansionPasses,
    };
    const finalSaved=await databaseRequest<number>("rpc/finalize_company_discovery_owned",{method:"POST",body:JSON.stringify({p_session_id:job.session_id,p_scheduler_run_id:context.schedulerRunId,p_result_summary:discoverySummary})});
    const finalSessionRows = await databaseRequest<Array<{ status: string; job_state?: string | null; result_summary_json?: Record<string, unknown> | null }>>(
      `discovery_sessions?id=eq.${job.session_id}&organisation_id=eq.${job.organisation_id}&select=status,job_state,result_summary_json&limit=1`
    );
    const finalSession = finalSessionRows[0];
    const expansionPending = finalSession?.status === "QUEUED" || finalSession?.result_summary_json?.expansionPending === true;
    if (!expansionPending) {
      await activity(
        job.session_id,
        context.schedulerRunId,
        "DISCOVERY_SUMMARY",
        Number(finalSaved) > 0 ? `${Number(finalSaved)} companies ready for review` : "Extended search completed without enough supported matches",
        Number(finalSaved) > 0
          ? `${verified} verified from ${result.companies.length} candidates on this pass.`
          : "SalesPilot completed every safe expansion pass without weakening the evidence standard. No weak recommendations were added.",
        discoverySummary,
      );
    }
    return {
      worker: "COMPANY_DISCOVERY",
      processed: true,
      outcome: expansionPending ? "CONTINUING" : Number(finalSaved) > 0 ? "COMPLETED_WITH_RESULTS" : "COMPLETED_NO_RESULTS",
      sessionId: job.session_id,
      saved: Number(finalSaved),
    };
  } catch (error) {
    const governanceReason = aiGovernanceBlockReason(error);
    if (governanceReason) {
      await databaseRequest("rpc/defer_company_discovery_governance_owned", {
        method: "POST",
        body: JSON.stringify({ p_session_id: job.session_id, p_scheduler_run_id: context.schedulerRunId, p_reason_code: governanceReason }),
      }).catch(() => undefined);
      await activity(job.session_id, context.schedulerRunId, "AI_ALLOWANCE_DEFERRED", "Research paused by current AI allowance", "SalesPilot kept this company-discovery job intact. It will resume automatically after the workspace allowance permits another AI request.", { reasonCode: governanceReason, failurePhase }).catch(() => undefined);
      return { worker: "COMPANY_DISCOVERY", processed: false, outcome: "DEFERRED", sessionId: job.session_id };
    }
    if (isPipelineOwnershipLost(error)) {
      console.info("Company Discovery worker superseded; stale worker result discarded", { sessionId: job.session_id, schedulerRunId: context.schedulerRunId });
      return { worker: "COMPANY_DISCOVERY", processed: false, outcome: "SUPERSEDED", sessionId: job.session_id };
    }
    const safeMessage=safeWorkerError(error);
    const classified=classifyPipelineError(error);
    const preparationFailure = failurePhase === "PREPARING" || failurePhase === "PLANNING";
    await activity(
      job.session_id,
      context.schedulerRunId,
      "DISCOVERY_TECHNICAL_RETRY",
      preparationFailure ? "Company research preparation will retry" : "Company research will retry",
      preparationFailure
        ? "SalesPilot could not finish preparing the market search plan. No company search was counted as completed, and preparation will resume automatically."
        : classified.code === "INVALID_AI_OUTPUT"
          ? "The research response did not complete cleanly, so SalesPilot held back every recommendation and scheduled a safe technical retry."
          : "SalesPilot encountered a technical issue during company research. No unverified recommendations were marked ready.",
      { errorCode: classified.code, failurePhase },
    ).catch(()=>undefined);
    await databaseRequest("rpc/record_company_discovery_failure_owned",{method:"POST",body:JSON.stringify({p_session_id:job.session_id,p_scheduler_run_id:context.schedulerRunId,p_error_code:classified.code,p_error_message:safeMessage,p_retryable:classified.retryable,p_failure_phase:failurePhase})}).catch(()=>undefined);
    throw error;
  }
}

import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";
import { discoverCompanies } from "@/lib/discovery/openai";
import { buildCompanySearchPlan, CompanySearchPlanSchema, type CompanySearchPlan } from "@/lib/discovery/search-plan";
import { verifyDiscoveredCompanyDetailed, type CompanyVerificationReason } from "@/lib/discovery/site-verifier";
import { CompanyDiscoveryResultSchema } from "@/lib/discovery/schemas";
import type { WorkerExecutionContext, WorkerExecutionResult } from "@/lib/pipeline/executor";
import { classifyPipelineError } from "@/lib/pipeline/errors";
import { createResultSummary } from "@/lib/pipeline/result-summary";
import { safePipelineFailureReason } from "@/lib/pipeline/safe-error";
import { isPipelineOwnershipLost } from "@/lib/pipeline/ownership";
import { aiGovernanceBlockReason, aiParallelCapacityReason } from "@/lib/ai/governance";
import { isOpenAIBackgroundPending } from "@/lib/ai/background-response";

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

async function activityOnce(sessionId:string,schedulerRunId:string,dedupeKey:string,type:string,title:string,description?:string,metadata:Record<string,unknown>={}) {
  try {
    await databaseRequest("rpc/record_discovery_activity_once_owned", {method:"POST",body:JSON.stringify({p_session_id:sessionId,p_scheduler_run_id:schedulerRunId,p_dedupe_key:dedupeKey,p_activity_type:type,p_title:title,p_description:description??null,p_metadata:metadata})});
  } catch (error) {
    console.error("Discovery once-activity write failed", { sessionId, type, dedupeKey, error });
  }
}

type DiscoveryCumulative = {
  candidatesReturned: number;
  candidatesVerified: number;
  candidatesHeld: number;
  reachableOfficialEvidence: number;
  excerptMatches: number;
  savedThisPass: number;
  heldReasons: Record<CompanyVerificationReason, number>;
};

function emptyCumulative(): DiscoveryCumulative {
  return {
    candidatesReturned: 0,
    candidatesVerified: 0,
    candidatesHeld: 0,
    reachableOfficialEvidence: 0,
    excerptMatches: 0,
    savedThisPass: 0,
    heldReasons: {
      INVALID_DOMAIN: 0,
      HOMEPAGE_UNREACHABLE: 0,
      NO_OFFICIAL_EVIDENCE: 0,
      EVIDENCE_TOO_WEAK: 0,
      CONFIDENCE_TOO_LOW: 0,
    },
  };
}

function candidateLimitFromEnv(): number {
  const parsed = Number(process.env.SALESPILOT_COMPANY_DISCOVERY_CANDIDATES_PER_ARCHETYPE ?? "4");
  return Number.isFinite(parsed) ? Math.max(1, Math.min(5, Math.floor(parsed))) : 4;
}

function cumulativeFrom(value: unknown): DiscoveryCumulative {
  const base = emptyCumulative();
  if (!value || typeof value !== "object" || Array.isArray(value)) return base;
  const row = value as Record<string, unknown>;
  const reasons = row.heldReasons && typeof row.heldReasons === "object" && !Array.isArray(row.heldReasons)
    ? row.heldReasons as Record<string, unknown>
    : {};
  const integer = (key: string) => Math.max(0, Math.floor(Number(row[key] ?? 0) || 0));
  return {
    candidatesReturned: integer("candidatesReturned"),
    candidatesVerified: integer("candidatesVerified"),
    candidatesHeld: integer("candidatesHeld"),
    reachableOfficialEvidence: integer("reachableOfficialEvidence"),
    excerptMatches: integer("excerptMatches"),
    savedThisPass: integer("savedThisPass"),
    heldReasons: {
      INVALID_DOMAIN: Math.max(0, Number(reasons.INVALID_DOMAIN ?? 0) || 0),
      HOMEPAGE_UNREACHABLE: Math.max(0, Number(reasons.HOMEPAGE_UNREACHABLE ?? 0) || 0),
      NO_OFFICIAL_EVIDENCE: Math.max(0, Number(reasons.NO_OFFICIAL_EVIDENCE ?? 0) || 0),
      EVIDENCE_TOO_WEAK: Math.max(0, Number(reasons.EVIDENCE_TOO_WEAK ?? 0) || 0),
      CONFIDENCE_TOO_LOW: Math.max(0, Number(reasons.CONFIDENCE_TOO_LOW ?? 0) || 0),
    },
  };
}

export async function runNextCompanyDiscovery(context: WorkerExecutionContext): Promise<WorkerExecutionResult> {
  const startedAt = Date.now();
  const claimed = await databaseRequest<Array<{ session_id: string; organisation_id: string; campaign_id: string }>>("rpc/claim_company_discovery_owned",{ method: "POST", body: JSON.stringify({ p_scheduler_run_id: context.schedulerRunId }) });
  const job = claimed[0];
  if (!job) return { worker: "COMPANY_DISCOVERY", processed: false, outcome: "NO_JOB" };
  let failurePhase = "PREPARING";
  try {
    const sessionRows = await databaseRequest<Array<{
      expansion_pass_count?: number | null;
      minimum_supported_companies?: number | null;
      max_expansion_passes?: number | null;
      company_search_plan_json?: unknown;
      company_search_plan_pass?: number | null;
      company_search_archetype_cursor?: number | null;
      company_search_archetype_total?: number | null;
      company_search_cumulative_json?: unknown;
      company_search_active_result_index?: number | null;
      company_search_active_result_json?: unknown;
    }>>(
      `discovery_sessions?id=eq.${job.session_id}&organisation_id=eq.${job.organisation_id}&select=expansion_pass_count,minimum_supported_companies,max_expansion_passes,company_search_plan_json,company_search_plan_pass,company_search_archetype_cursor,company_search_archetype_total,company_search_cumulative_json,company_search_active_result_index,company_search_active_result_json&limit=1`
    );
    const session = sessionRows[0] ?? {};
    const expansionPassCount = Number(session.expansion_pass_count ?? 0);
    const searchPass = expansionPassCount + 1;
    const minimumSupportedCompanies = Number(session.minimum_supported_companies ?? 3);
    const maxExpansionPasses = Number(session.max_expansion_passes ?? 6);
    const searchStrategies = [
      "EXACT_INDUSTRY",
      "ADJACENT_INDUSTRIES",
      "OPERATIONAL_SIMILARITY",
      "PROBLEM_SIMILARITY",
      "BUYER_SIMILARITY",
      "COMPANY_ECOSYSTEM",
    ] as const;
    const searchStrategy = searchStrategies[Math.min(expansionPassCount, searchStrategies.length - 1)];

    const campaigns = await databaseRequest<any[]>(`campaign_detail?id=eq.${job.campaign_id}&organisation_id=eq.${job.organisation_id}&limit=1`);
    const campaign = campaigns[0];
    if (!campaign) throw new Error("CAMPAIGN_NOT_FOUND");
    const campaignRows = await databaseRequest<any[]>(`campaigns?id=eq.${job.campaign_id}&organisation_id=eq.${job.organisation_id}&limit=1&select=business_profile_id`);
    const profileId = campaignRows[0]?.business_profile_id;
    if (!profileId) throw new Error("BUSINESS_PROFILE_NOT_FOUND");
    const profiles = await databaseRequest<any[]>(`business_profile_versions?business_profile_id=eq.${profileId}&organisation_id=eq.${job.organisation_id}&order=version_number.desc&limit=1&select=payload_json`);
    const business = profiles[0]?.payload_json ?? { name: campaign.business_name, summary: campaign.business_summary, website: campaign.website_url };

    let searchPlan: CompanySearchPlan | null = null;
    if (Number(session.company_search_plan_pass ?? 0) === searchPass && session.company_search_plan_json) {
      const parsed = CompanySearchPlanSchema.safeParse(session.company_search_plan_json);
      if (parsed.success) searchPlan = parsed.data;
    }

    if (!searchPlan) {
      await activity(
        job.session_id,
        context.schedulerRunId,
        searchPass > 1 ? "DISCOVERY_EXPANSION_STARTED" : "DISCOVERY_STARTED",
        searchPass > 1 ? `Expanding company search · pass ${searchPass}` : "Company discovery started",
        searchPass > 1
          ? "MarketRoute is planning another evidence-backed market pass because the earlier search retained too few strong matches."
          : "MarketRoute is preparing a search from the approved campaign.",
        { searchPass, searchStrategy, minimumSupportedCompanies, maxExpansionPasses },
      );
      await activity(job.session_id,context.schedulerRunId,"SEARCH_PREPARED","Approved strategy verified","The audience, buyer roles and commercial angle are ready for company research.");
      failurePhase = "PLANNING";
      await databaseRequest("rpc/update_company_discovery_progress_owned",{method:"POST",body:JSON.stringify({p_session_id:job.session_id,p_scheduler_run_id:context.schedulerRunId,p_stage:"PLANNING",p_progress:28})});
      await activity(job.session_id,context.schedulerRunId,"SEARCH_PLAN_STARTED","Building the market search plan","MarketRoute is deterministically translating the approved campaign into operational conditions, target account archetypes and high-value evidence sources before external research begins.",{searchPass,searchStrategy});
      searchPlan = await buildCompanySearchPlan({
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
      await databaseRequest("rpc/persist_company_discovery_search_plan_owned",{
        method:"POST",
        body:JSON.stringify({
          p_session_id:job.session_id,
          p_scheduler_run_id:context.schedulerRunId,
          p_search_pass:searchPass,
          p_search_plan:searchPlan,
          p_archetype_total:searchPlan.companyArchetypes.length,
        }),
      });
      await activity(job.session_id,context.schedulerRunId,"SEARCH_PLAN_READY","Market search plan ready",`${searchPlan.companyArchetypes.length} target account archetypes will be researched as bounded, resumable units before the evidence gate is applied.`,{
        commercialProblem:searchPlan.commercialProblem,
        operationalConditions:searchPlan.operationalConditions,
        archetypes:searchPlan.companyArchetypes.map((item: CompanySearchPlan["companyArchetypes"][number])=>item.name),
        sourcePriority:searchPlan.sourcePriority,
        workloadMode:"BOUNDED_ARCHETYPE_UNITS",
      });
    }

    const archetypeTotal = searchPlan.companyArchetypes.length;
    const storedCursor = Number(session.company_search_plan_pass ?? 0) === searchPass
      ? Math.max(0, Number(session.company_search_archetype_cursor ?? 0))
      : 0;
    const cumulative = Number(session.company_search_plan_pass ?? 0) === searchPass
      ? cumulativeFrom(session.company_search_cumulative_json)
      : emptyCumulative();

    // If the final archetype was persisted but the worker died before finalising,
    // do not pay for or execute the AI work again. Finish from persisted facts.
    if (storedCursor >= archetypeTotal) {
      const retainedRows = await databaseRequest<Array<{ id: string }>>(`companies?organisation_id=eq.${job.organisation_id}&campaign_id=eq.${job.campaign_id}&select=id&limit=1000`);
      const discoverySummary = {
        ...createResultSummary(cumulative.savedThisPass>0?"COMPLETED_WITH_RESULTS":"COMPLETED_NO_RESULTS",cumulative.savedThisPass,startedAt),
        ...cumulative,
        searchPass,
        searchStrategy,
        searchPlanSummary: {
          commercialProblem: searchPlan.commercialProblem,
          archetypes: searchPlan.companyArchetypes.map((item: CompanySearchPlan["companyArchetypes"][number])=>item.name),
          operationalConditions: searchPlan.operationalConditions,
          sourcePriority: searchPlan.sourcePriority,
        },
        archetypesCompleted: archetypeTotal,
        archetypesTotal: archetypeTotal,
        retainedAfterPass: retainedRows.length,
        minimumSupportedCompanies,
        maxExpansionPasses,
        workloadMode:"BOUNDED_ARCHETYPE_UNITS",
      };
      const finalSaved=await databaseRequest<number>("rpc/finalize_company_discovery_owned",{method:"POST",body:JSON.stringify({p_session_id:job.session_id,p_scheduler_run_id:context.schedulerRunId,p_result_summary:discoverySummary})});
      return { worker:"COMPANY_DISCOVERY",processed:true,outcome:Number(finalSaved)>0?"COMPLETED_WITH_RESULTS":"COMPLETED_NO_RESULTS",sessionId:job.session_id,saved:Number(finalSaved) };
    }

    const archetypeIndex = storedCursor;
    const archetype = searchPlan.companyArchetypes[archetypeIndex];
    const boundedPlan: CompanySearchPlan = { ...searchPlan, companyArchetypes: [archetype] };
    const targetCandidateLimit = candidateLimitFromEnv();
    const researchProgress = 40 + Math.round((archetypeIndex / archetypeTotal) * 30);
    failurePhase = "SEARCHING";
    await databaseRequest("rpc/update_company_discovery_progress_owned",{method:"POST",body:JSON.stringify({p_session_id:job.session_id,p_scheduler_run_id:context.schedulerRunId,p_stage:"SEARCHING",p_progress:researchProgress})});
    await activityOnce(job.session_id,context.schedulerRunId,`archetype-start:${searchPass}:${archetypeIndex}`,"ARCHETYPE_RESEARCH_STARTED",`Researching target account archetype ${archetypeIndex + 1} of ${archetypeTotal}`,`${archetype.name}: ${archetype.operatingReality}`,{archetypeIndex,archetypeTotal,archetypeName:archetype.name,targetCandidateLimit,searchPass,searchStrategy});

    const existingCompanies = await databaseRequest<Array<{ company_name: string; canonical_domain: string }>>(
      `companies?organisation_id=eq.${job.organisation_id}&campaign_id=eq.${job.campaign_id}&select=company_name,canonical_domain&limit=1000`
    );
    let result: ReturnType<typeof CompanyDiscoveryResultSchema.parse> | null = null;
    if (Number(session.company_search_active_result_index ?? -1) === archetypeIndex && session.company_search_active_result_json) {
      const persisted = CompanyDiscoveryResultSchema.safeParse(session.company_search_active_result_json);
      if (persisted.success) {
        result = persisted.data;
        await activity(job.session_id,context.schedulerRunId,"ARCHETYPE_RESULT_RESUMED",`Resuming ${archetype.name} evidence verification`,"The completed GPT-5 research result was already persisted, so MarketRoute is resuming verification without repeating the AI request.",{archetypeIndex,archetypeTotal,archetypeName:archetype.name});
      }
    }
    if (!result) {
      result = await discoverCompanies({
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
        searchPlan:boundedPlan,
        targetCandidateLimit,
        archetypeIndex,
        archetypeTotal,
      });
      await databaseRequest("rpc/persist_company_discovery_archetype_result_owned",{
        method:"POST",
        body:JSON.stringify({p_session_id:job.session_id,p_scheduler_run_id:context.schedulerRunId,p_archetype_index:archetypeIndex,p_result:result}),
      });
    }

    failurePhase = "VERIFYING";
    const verificationProgress = 44 + Math.round(((archetypeIndex + 1) / archetypeTotal) * 26);
    await databaseRequest("rpc/update_company_discovery_progress_owned",{method:"POST",body:JSON.stringify({p_session_id:job.session_id,p_scheduler_run_id:context.schedulerRunId,p_stage:"VERIFYING",p_progress:Math.min(70,verificationProgress),p_candidates:cumulative.candidatesReturned + result.companies.length})});
    await activity(job.session_id,context.schedulerRunId,"ARCHETYPE_CANDIDATES_FOUND",result.companies.length>0?`${result.companies.length} candidates found for ${archetype.name}`:`No supported candidates found for ${archetype.name}`,result.companies.length>0?"MarketRoute is independently checking each candidate against official-site evidence.":"This archetype completed without supported candidates. The remaining market plan will continue without weakening the evidence standard.",{candidateCount:result.companies.length,archetypeIndex,archetypeTotal,archetypeName:archetype.name});

    let saved=0;
    let verified=0;
    const heldReasons: Record<CompanyVerificationReason, number> = {
      INVALID_DOMAIN: 0,
      HOMEPAGE_UNREACHABLE: 0,
      NO_OFFICIAL_EVIDENCE: 0,
      EVIDENCE_TOO_WEAK: 0,
      CONFIDENCE_TOO_LOW: 0,
    };
    let reachableOfficialEvidence=0;
    let excerptMatches=0;
    for (let index=0; index<result.companies.length; index++) {
      const candidate=result.companies[index];
      const verification=await verifyDiscoveredCompanyDetailed(candidate);
      reachableOfficialEvidence += verification.diagnostics.officialEvidenceReachable;
      excerptMatches += verification.diagnostics.excerptMatches;
      if (!verification.accepted) {
        heldReasons[verification.reason] += 1;
        await activity(job.session_id,context.schedulerRunId,"CANDIDATE_HELD",`${candidate.name} held back`,"The available official-site evidence was not strong enough to recommend this company.",{companyName:candidate.name,reason:verification.reason,diagnostics:verification.diagnostics,archetypeName:archetype.name});
        continue;
      }
      const company=verification.company;
      verified+=1;
      const count=await databaseRequest<number>("rpc/save_company_discovery_batch_owned",{method:"POST",body:JSON.stringify({p_session_id:job.session_id,p_scheduler_run_id:context.schedulerRunId,p_companies:[company]})});
      saved+=Number(count);
      await activity(job.session_id,context.schedulerRunId,"COMPANY_SAVED",`${company.name} verified and added`,`${company.matchLabel} · ${company.confidence}/100 confidence · ${company.evidenceQuality}/100 evidence quality`,{companyName:company.name,confidence:company.confidence,evidenceQuality:company.evidenceQuality,savedCount:saved,archetypeName:archetype.name});
    }

    cumulative.candidatesReturned += result.companies.length;
    cumulative.candidatesVerified += verified;
    cumulative.candidatesHeld += result.companies.length-verified;
    cumulative.reachableOfficialEvidence += reachableOfficialEvidence;
    cumulative.excerptMatches += excerptMatches;
    cumulative.savedThisPass += saved;
    for (const reason of Object.keys(heldReasons) as CompanyVerificationReason[]) cumulative.heldReasons[reason] += heldReasons[reason];

    const isLastArchetype = archetypeIndex + 1 >= archetypeTotal;
    await activity(job.session_id,context.schedulerRunId,"ARCHETYPE_RESEARCH_COMPLETE",`${archetype.name} research complete`,`${verified} of ${result.companies.length} candidates passed the independent evidence gate.`,{archetypeIndex,archetypeTotal,archetypeName:archetype.name,verified,saved,nextArchetype:isLastArchetype?null:searchPlan.companyArchetypes[archetypeIndex+1]?.name});
    await databaseRequest("rpc/complete_company_discovery_archetype_owned",{
      method:"POST",
      body:JSON.stringify({
        p_session_id:job.session_id,
        p_scheduler_run_id:context.schedulerRunId,
        p_completed_archetype_index:archetypeIndex,
        p_archetype_total:archetypeTotal,
        p_cumulative_summary:cumulative,
        p_release_for_next:!isLastArchetype,
      }),
    });

    if (!isLastArchetype) {
      return { worker:"COMPANY_DISCOVERY",processed:true,outcome:"CONTINUING",sessionId:job.session_id,saved:cumulative.savedThisPass };
    }

    const retainedRows = await databaseRequest<Array<{ id: string }>>(`companies?organisation_id=eq.${job.organisation_id}&campaign_id=eq.${job.campaign_id}&select=id&limit=1000`);
    const discoverySummary = {
      ...createResultSummary(cumulative.savedThisPass>0?"COMPLETED_WITH_RESULTS":"COMPLETED_NO_RESULTS",cumulative.savedThisPass,startedAt),
      ...cumulative,
      searchPass,
      searchStrategy,
      searchPlanSummary: {
        commercialProblem: searchPlan.commercialProblem,
        archetypes: searchPlan.companyArchetypes.map((item: CompanySearchPlan["companyArchetypes"][number])=>item.name),
        operationalConditions: searchPlan.operationalConditions,
        sourcePriority: searchPlan.sourcePriority,
      },
      archetypesCompleted:archetypeTotal,
      archetypesTotal:archetypeTotal,
      retainedAfterPass:retainedRows.length,
      minimumSupportedCompanies,
      maxExpansionPasses,
      workloadMode:"BOUNDED_ARCHETYPE_UNITS",
    };
    const finalSaved=await databaseRequest<number>("rpc/finalize_company_discovery_owned",{method:"POST",body:JSON.stringify({p_session_id:job.session_id,p_scheduler_run_id:context.schedulerRunId,p_result_summary:discoverySummary})});
    const finalSessionRows = await databaseRequest<Array<{ status: string; result_summary_json?: Record<string, unknown> | null }>>(`discovery_sessions?id=eq.${job.session_id}&organisation_id=eq.${job.organisation_id}&select=status,result_summary_json&limit=1`);
    const expansionPending = finalSessionRows[0]?.status === "QUEUED" || finalSessionRows[0]?.result_summary_json?.expansionPending === true;
    if (!expansionPending) {
      await activity(job.session_id,context.schedulerRunId,"DISCOVERY_SUMMARY",Number(finalSaved)>0?`${Number(finalSaved)} companies ready for review`:"Extended search completed without enough supported matches",Number(finalSaved)>0?`${cumulative.candidatesVerified} verified from ${cumulative.candidatesReturned} candidates across ${archetypeTotal} target account archetypes.`:"MarketRoute completed every safe expansion pass without weakening the evidence standard. No weak recommendations were added.",discoverySummary);
    }
    return { worker:"COMPANY_DISCOVERY",processed:true,outcome:expansionPending?"CONTINUING":Number(finalSaved)>0?"COMPLETED_WITH_RESULTS":"COMPLETED_NO_RESULTS",sessionId:job.session_id,saved:Number(finalSaved) };
  } catch (error) {
    if (isOpenAIBackgroundPending(error)) {
      await databaseRequest("rpc/defer_company_discovery_background_owned", { method:"POST", body:JSON.stringify({p_session_id:job.session_id,p_scheduler_run_id:context.schedulerRunId}) }).catch(()=>undefined);
      await activity(job.session_id,context.schedulerRunId,"AI_BACKGROUND_CONTINUING","Market research is still running","MarketRoute has safely released this scheduler cycle while GPT-5 continues the same bounded research unit. The completed response will be collected on a later cycle without starting the work again.",{failurePhase,responseId:error.responseId,status:error.status}).catch(()=>undefined);
      return { worker:"COMPANY_DISCOVERY",processed:false,outcome:"DEFERRED",sessionId:job.session_id };
    }
    const capacityReason = aiParallelCapacityReason(error);
    if (capacityReason) {
      await databaseRequest("rpc/defer_company_discovery_background_owned", { method: "POST", body: JSON.stringify({ p_session_id: job.session_id, p_scheduler_run_id: context.schedulerRunId }) }).catch(() => undefined);
      return { worker: "COMPANY_DISCOVERY", processed: false, outcome: "DEFERRED", sessionId: job.session_id };
    }
    const governanceReason = aiGovernanceBlockReason(error);
    if (governanceReason) {
      await databaseRequest("rpc/defer_company_discovery_governance_owned", { method:"POST", body:JSON.stringify({p_session_id:job.session_id,p_scheduler_run_id:context.schedulerRunId,p_reason_code:governanceReason}) }).catch(()=>undefined);
      await activity(job.session_id,context.schedulerRunId,"AI_ALLOWANCE_DEFERRED","Research paused by current AI allowance","MarketRoute kept this company-discovery unit intact. It will resume from the same target account archetype after the workspace allowance permits another AI request.",{reasonCode:governanceReason,failurePhase}).catch(()=>undefined);
      return { worker:"COMPANY_DISCOVERY",processed:false,outcome:"DEFERRED",sessionId:job.session_id };
    }
    if (isPipelineOwnershipLost(error)) {
      console.info("Company Discovery worker superseded; stale worker result discarded",{sessionId:job.session_id,schedulerRunId:context.schedulerRunId});
      return { worker:"COMPANY_DISCOVERY",processed:false,outcome:"SUPERSEDED",sessionId:job.session_id };
    }
    const safeMessage=safeWorkerError(error);
    const classified=classifyPipelineError(error);
    const preparationFailure=failurePhase==="PREPARING"||failurePhase==="PLANNING";
    await activity(job.session_id,context.schedulerRunId,"DISCOVERY_TECHNICAL_RETRY",preparationFailure?"Company research preparation will retry":"Company research unit will retry",preparationFailure?"MarketRoute could not finish preparing the market search plan. No company search was counted as completed, and preparation will resume automatically.":classified.code==="INVALID_AI_OUTPUT"?"The bounded research response did not complete cleanly, so MarketRoute held back every recommendation and will retry the same target account archetype.":"MarketRoute encountered a technical issue during this bounded company-research unit. Completed archetypes remain persisted and the same unit will retry safely.",{errorCode:classified.code,failurePhase}).catch(()=>undefined);
    await databaseRequest("rpc/record_company_discovery_failure_owned",{method:"POST",body:JSON.stringify({p_session_id:job.session_id,p_scheduler_run_id:context.schedulerRunId,p_error_code:classified.code,p_error_message:safeMessage,p_retryable:classified.retryable,p_failure_phase:failurePhase})}).catch(()=>undefined);
    throw error;
  }
}

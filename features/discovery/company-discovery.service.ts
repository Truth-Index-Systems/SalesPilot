import "server-only";
import { loadGenesisSellerContext } from "@/lib/integrations/genesis-t8/genesis-seller-context";
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
import { scoreCommercialPriority } from "@/lib/discovery/commercial-priority";

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
      VERIFICATION_TECHNICAL_FAILURE: 0,
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
      VERIFICATION_TECHNICAL_FAILURE: Math.max(0, Number(reasons.VERIFICATION_TECHNICAL_FAILURE ?? 0) || 0),
    },
  };
}

function evidenceConcurrencyFromEnv(): number {
  const parsed = Number(process.env.MARKETROUTE_COMPANY_EVIDENCE_CONCURRENCY ?? process.env.SALESPILOT_COMPANY_EVIDENCE_CONCURRENCY ?? "3");
  return Number.isFinite(parsed) ? Math.max(1, Math.min(5, Math.floor(parsed))) : 3;
}

async function runBounded<T>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<void>): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
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
    const sellerContext = await loadGenesisSellerContext(job.campaign_id, job.organisation_id);
    const business = sellerContext.businessDNA as unknown as Record<string, unknown>;

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
      await databaseRequest("rpc/update_company_discovery_progress_owned",{method:"POST",body:JSON.stringify({p_session_id:job.session_id,p_scheduler_run_id:context.schedulerRunId,p_stage:"SEARCH_PLAN_RUNNING",p_progress:24})});
      await activity(job.session_id,context.schedulerRunId,"SEARCH_PLAN_STARTED","Building your market search strategy","MarketRoute is turning the approved campaign into focused target-account archetypes, search language and evidence priorities so market discovery can start immediately.",{searchPass,searchStrategy});
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
    await databaseRequest("rpc/update_company_discovery_progress_owned",{method:"POST",body:JSON.stringify({p_session_id:job.session_id,p_scheduler_run_id:context.schedulerRunId,p_stage:"BREADTH_DISCOVERY",p_progress:Math.max(38,researchProgress)})});
    await activityOnce(job.session_id,context.schedulerRunId,`archetype-start:${searchPass}:${archetypeIndex}`,"ARCHETYPE_RESEARCH_STARTED",`Researching target account archetype ${archetypeIndex + 1} of ${archetypeTotal}`,`${archetype.name}: ${archetype.operatingReality}`,{archetypeIndex,archetypeTotal,archetypeName:archetype.name,targetCandidateLimit,searchPass,searchStrategy});

    const [existingCompanies,stagedCandidates] = await Promise.all([
      databaseRequest<Array<{ company_name: string; canonical_domain: string }>>(
        `companies?organisation_id=eq.${job.organisation_id}&campaign_id=eq.${job.campaign_id}&select=company_name,canonical_domain&limit=1000`
      ),
      databaseRequest<Array<{ company_name: string; canonical_domain: string }>>(
        `company_discovery_candidates?discovery_session_id=eq.${job.session_id}&search_pass=eq.${searchPass}&select=company_name,canonical_domain&limit=1000`
      ),
    ]);
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
        excludedCompanies:[...existingCompanies,...stagedCandidates].map(company=>({name:company.company_name,domain:company.canonical_domain})),
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

    // G5.1.13.1: breadth-search candidates are persisted immediately into a
    // staging surface. This makes discovery visible before evidence verification
    // without allowing unverified candidates into the canonical companies table.
    await databaseRequest("rpc/persist_company_discovery_candidate_batch_owned",{
      method:"POST",
      body:JSON.stringify({
        p_session_id:job.session_id,
        p_scheduler_run_id:context.schedulerRunId,
        p_search_pass:searchPass,
        p_archetype_index:archetypeIndex,
        p_candidates:result.companies,
      }),
    });
    await activityOnce(
      job.session_id,
      context.schedulerRunId,
      `breadth-batch:${searchPass}:${archetypeIndex}`,
      "DISCOVERY_BATCH_READY",
      result.companies.length>0
        ? `${result.companies.length} compan${result.companies.length===1?"y":"ies"} discovered in ${archetype.name}`
        : `Market scan completed for ${archetype.name}`,
      result.companies.length>0
        ? "These candidates are visible immediately while MarketRoute checks official evidence before recommending them."
        : "No supported breadth candidates were returned for this archetype; MarketRoute is continuing through the rest of the search plan.",
      {searchPass,archetypeIndex,archetypeTotal,archetypeName:archetype.name,candidateCount:result.companies.length,companyNames:result.companies.slice(0,6).map(company=>company.name)},
    );

    failurePhase = "VERIFYING";
    const verificationProgress = 44 + Math.round(((archetypeIndex + 1) / archetypeTotal) * 26);
    await databaseRequest("rpc/update_company_discovery_progress_owned",{method:"POST",body:JSON.stringify({p_session_id:job.session_id,p_scheduler_run_id:context.schedulerRunId,p_stage:"VERIFYING",p_progress:Math.min(70,verificationProgress),p_candidates:cumulative.candidatesReturned + result.companies.length})});
    await activityOnce(job.session_id,context.schedulerRunId,`archetype-candidates:${searchPass}:${archetypeIndex}`,"ARCHETYPE_CANDIDATES_FOUND",result.companies.length>0?`${result.companies.length} candidates found for ${archetype.name}`:`No supported candidates found for ${archetype.name}`,result.companies.length>0?"MarketRoute is independently checking each candidate against official-site evidence.":"This archetype completed without supported candidates. The remaining market plan will continue without weakening the evidence standard.",{candidateCount:result.companies.length,archetypeIndex,archetypeTotal,archetypeName:archetype.name});

    // G5.1.13.2: evidence checks are independent, ownership-fenced work units.
    // A slow or transiently failing company cannot serially block the rest of the batch.
    const evidenceConcurrency = evidenceConcurrencyFromEnv();
    await activityOnce(job.session_id,context.schedulerRunId,`evidence-parallel:${searchPass}:${archetypeIndex}`,"EVIDENCE_PARALLEL_STARTED",`Checking ${result.companies.length} companies in parallel`,`${evidenceConcurrency} evidence workers are independently validating official company sources.`,{searchPass,archetypeIndex,archetypeTotal,evidenceConcurrency,candidateCount:result.companies.length});

    await runBounded(result.companies,evidenceConcurrency,async (candidate) => {
      const claims=await databaseRequest<Array<{candidate_id:string;worker_token:string;attempt_count:number;candidate_status:string}>>("rpc/claim_company_discovery_candidate_verification_owned",{
        method:"POST",
        body:JSON.stringify({p_session_id:job.session_id,p_scheduler_run_id:context.schedulerRunId,p_search_pass:searchPass,p_archetype_index:archetypeIndex,p_website_url:candidate.websiteUrl,p_lease_seconds:90}),
      });
      const claim=claims[0];
      if (!claim) return; // already terminal, or another valid owner still holds the unit
      try {
        const verification=await verifyDiscoveredCompanyDetailed(candidate);
        if (!verification.accepted) {
          await databaseRequest("rpc/complete_company_discovery_candidate_verification_owned",{method:"POST",body:JSON.stringify({p_session_id:job.session_id,p_scheduler_run_id:context.schedulerRunId,p_candidate_id:claim.candidate_id,p_worker_token:claim.worker_token,p_status:"HELD",p_hold_reason:verification.reason,p_diagnostics:verification.diagnostics})});
          await activityOnce(job.session_id,context.schedulerRunId,`candidate-held:${searchPass}:${archetypeIndex}:${claim.candidate_id}`,"CANDIDATE_HELD",`${candidate.name} held back`,"The available official-site evidence was not strong enough to recommend this company.",{companyName:candidate.name,reason:verification.reason,diagnostics:verification.diagnostics,archetypeName:archetype.name});
          return;
        }
        const company=verification.company;
        await databaseRequest<number>("rpc/save_company_discovery_batch_owned",{method:"POST",body:JSON.stringify({p_session_id:job.session_id,p_scheduler_run_id:context.schedulerRunId,p_companies:[company]})});
        const commercialPriority=scoreCommercialPriority(company);
        await databaseRequest("rpc/set_company_commercial_priority_owned",{method:"POST",body:JSON.stringify({
          p_session_id:job.session_id,
          p_scheduler_run_id:context.schedulerRunId,
          p_website_url:company.websiteUrl,
          p_priority_score:commercialPriority.score,
          p_priority_tier:commercialPriority.tier,
          p_priority_reasons:commercialPriority.reasons,
        })});
        await databaseRequest("rpc/complete_company_discovery_candidate_verification_owned",{method:"POST",body:JSON.stringify({p_session_id:job.session_id,p_scheduler_run_id:context.schedulerRunId,p_candidate_id:claim.candidate_id,p_worker_token:claim.worker_token,p_status:"VERIFIED",p_diagnostics:verification.diagnostics})});
        await activityOnce(job.session_id,context.schedulerRunId,`candidate-verified:${searchPass}:${archetypeIndex}:${claim.candidate_id}`,"COMPANY_SAVED",`${company.name} verified and added`,`${company.matchLabel} · ${company.confidence}/100 confidence · ${company.evidenceQuality}/100 evidence quality · priority ${commercialPriority.tier}`,{companyName:company.name,confidence:company.confidence,evidenceQuality:company.evidenceQuality,commercialPriorityScore:commercialPriority.score,commercialPriorityTier:commercialPriority.tier,archetypeName:archetype.name});
      } catch (error) {
        const message=error instanceof Error?error.message:"Evidence verification interrupted";
        const nextStatus=await databaseRequest<string>("rpc/release_company_discovery_candidate_verification_owned",{method:"POST",body:JSON.stringify({p_session_id:job.session_id,p_scheduler_run_id:context.schedulerRunId,p_candidate_id:claim.candidate_id,p_worker_token:claim.worker_token,p_error_message:message,p_max_attempts:3})}).catch(()=>"DISCOVERED");
        if (nextStatus==="HELD") {
          await activityOnce(job.session_id,context.schedulerRunId,`candidate-technical-hold:${searchPass}:${archetypeIndex}:${claim.candidate_id}`,"CANDIDATE_HELD",`${candidate.name} held back`,"MarketRoute could not establish stable official-site evidence after several independent attempts, so the company was not recommended.",{companyName:candidate.name,reason:"VERIFICATION_TECHNICAL_FAILURE",archetypeName:archetype.name});
        }
      }
    });

    const candidateRows=await databaseRequest<Array<{candidate_status:string;hold_reason:string|null;verification_diagnostics_json:Record<string,unknown>|null}>>(`company_discovery_candidates?discovery_session_id=eq.${job.session_id}&search_pass=eq.${searchPass}&archetype_index=eq.${archetypeIndex}&select=candidate_status,hold_reason,verification_diagnostics_json&limit=1000`);
    const stateRows=await databaseRequest<Array<{total:number;discovered:number;verifying:number;verified:number;held:number}>>("rpc/company_discovery_archetype_verification_state_owned",{method:"POST",body:JSON.stringify({p_session_id:job.session_id,p_scheduler_run_id:context.schedulerRunId,p_search_pass:searchPass,p_archetype_index:archetypeIndex})});
    const state=stateRows[0] ?? {total:candidateRows.length,discovered:0,verifying:0,verified:0,held:0};
    if (Number(state.discovered)>0 || Number(state.verifying)>0) {
      await databaseRequest("rpc/defer_company_discovery_evidence_owned",{method:"POST",body:JSON.stringify({p_session_id:job.session_id,p_scheduler_run_id:context.schedulerRunId})});
      await activityOnce(job.session_id,context.schedulerRunId,`evidence-resume:${searchPass}:${archetypeIndex}`,"EVIDENCE_PARALLEL_CONTINUING","Evidence checks are continuing",`${Number(state.verified)+Number(state.held)} of ${Number(state.total)} candidates have reached a final evidence decision. Remaining candidates will resume independently.`,{searchPass,archetypeIndex,archetypeTotal,...state,evidenceConcurrency});
      return { worker:"COMPANY_DISCOVERY",processed:true,outcome:"CONTINUING",sessionId:job.session_id,saved:cumulative.savedThisPass };
    }

    let saved=Number(state.verified);
    let verified=Number(state.verified);
    const heldReasons: Record<CompanyVerificationReason, number> = {
      INVALID_DOMAIN:0,HOMEPAGE_UNREACHABLE:0,NO_OFFICIAL_EVIDENCE:0,EVIDENCE_TOO_WEAK:0,CONFIDENCE_TOO_LOW:0,VERIFICATION_TECHNICAL_FAILURE:0,
    };
    let reachableOfficialEvidence=0;
    let excerptMatches=0;
    for (const row of candidateRows) {
      const diagnostics=row.verification_diagnostics_json ?? {};
      reachableOfficialEvidence += Math.max(0,Number(diagnostics.officialEvidenceReachable ?? 0)||0);
      excerptMatches += Math.max(0,Number(diagnostics.excerptMatches ?? 0)||0);
      if (row.candidate_status==="HELD") {
        const reason=(row.hold_reason ?? "VERIFICATION_TECHNICAL_FAILURE") as CompanyVerificationReason;
        if (reason in heldReasons) heldReasons[reason]+=1;
        else heldReasons.VERIFICATION_TECHNICAL_FAILURE+=1;
      }
    }

    cumulative.candidatesReturned += candidateRows.length;
    cumulative.candidatesVerified += verified;
    cumulative.candidatesHeld += Number(state.held);
    cumulative.reachableOfficialEvidence += reachableOfficialEvidence;
    cumulative.excerptMatches += excerptMatches;
    cumulative.savedThisPass += saved;
    for (const reason of Object.keys(heldReasons) as CompanyVerificationReason[]) cumulative.heldReasons[reason] += heldReasons[reason];

    const isLastArchetype = archetypeIndex + 1 >= archetypeTotal;
    await activityOnce(job.session_id,context.schedulerRunId,`archetype-complete:${searchPass}:${archetypeIndex}`,"ARCHETYPE_RESEARCH_COMPLETE",`${archetype.name} research complete`,`${verified} of ${result.companies.length} candidates passed the independent evidence gate.`,{archetypeIndex,archetypeTotal,archetypeName:archetype.name,verified,saved,nextArchetype:isLastArchetype?null:searchPlan.companyArchetypes[archetypeIndex+1]?.name});
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
      // Record the idempotent customer-facing activity while this scheduler run
      // still owns the discovery session. defer_company_discovery_background_owned
      // deliberately releases scheduler ownership, so any owned write after it
      // would correctly fail with COMPANY_DISCOVERY_OWNERSHIP_LOST.
      await activityOnce(job.session_id,context.schedulerRunId,`ai-background:${error.responseId}`,"AI_BACKGROUND_CONTINUING","Market research is still running","MarketRoute is continuing the same bounded research unit in the background. The completed response will be collected on a later cycle without starting the work again.",{failurePhase,responseId:error.responseId,status:error.status}).catch(()=>undefined);
      await databaseRequest("rpc/defer_company_discovery_background_owned", { method:"POST", body:JSON.stringify({p_session_id:job.session_id,p_scheduler_run_id:context.schedulerRunId}) }).catch(()=>undefined);
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

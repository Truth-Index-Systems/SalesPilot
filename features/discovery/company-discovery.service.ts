import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";
import { discoverCompanies } from "@/lib/discovery/openai";
import { verifyDiscoveredCompanyDetailed, type CompanyVerificationReason } from "@/lib/discovery/site-verifier";
import type { WorkerExecutionContext, WorkerExecutionResult } from "@/lib/pipeline/executor";
import { classifyPipelineError } from "@/lib/pipeline/errors";
import { createResultSummary } from "@/lib/pipeline/result-summary";

function safeWorkerError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Company discovery failed";
  if (message.startsWith("OPENAI_DISCOVERY_FAILED:")) return message.slice(0, 500);
  if (["CAMPAIGN_NOT_FOUND", "BUSINESS_PROFILE_NOT_FOUND", "DISCOVERY_NO_VERIFIED_COMPANIES", "OPENAI_API_KEY_NOT_CONFIGURED"].includes(message)) return message;
  return "COMPANY_DISCOVERY_FAILED";
}

async function activity(sessionId:string,type:string,title:string,description?:string,metadata:Record<string,unknown>={}) {
  await databaseRequest("rpc/record_discovery_activity", {method:"POST",body:JSON.stringify({p_session_id:sessionId,p_activity_type:type,p_title:title,p_description:description??null,p_metadata:metadata})});
}

export async function runNextCompanyDiscovery(context: WorkerExecutionContext): Promise<WorkerExecutionResult> {
  const startedAt = Date.now();
  const claimed = await databaseRequest<Array<{ session_id: string; organisation_id: string; campaign_id: string }>>("rpc/claim_company_discovery",{ method: "POST", body: JSON.stringify({ p_scheduler_run_id: context.schedulerRunId }) });
  const job = claimed[0];
  if (!job) return { worker: "COMPANY_DISCOVERY", processed: false, outcome: "NO_JOB" };
  try {
    await activity(job.session_id,"DISCOVERY_STARTED","Company discovery started","SalesPilot is preparing a search from the approved campaign.");
    const campaigns = await databaseRequest<any[]>(`campaign_detail?id=eq.${job.campaign_id}&organisation_id=eq.${job.organisation_id}&limit=1`);
    const campaign = campaigns[0];
    if (!campaign) throw new Error("CAMPAIGN_NOT_FOUND");
    const campaignRows = await databaseRequest<any[]>(`campaigns?id=eq.${job.campaign_id}&organisation_id=eq.${job.organisation_id}&limit=1&select=business_profile_id`);
    const profileId = campaignRows[0]?.business_profile_id;
    if (!profileId) throw new Error("BUSINESS_PROFILE_NOT_FOUND");
    const profiles = await databaseRequest<any[]>(`business_profile_versions?business_profile_id=eq.${profileId}&organisation_id=eq.${job.organisation_id}&order=version_number.desc&limit=1&select=payload_json`);
    const business = profiles[0]?.payload_json ?? { name: campaign.business_name, summary: campaign.business_summary, website: campaign.website_url };

    await activity(job.session_id,"SEARCH_PREPARED","Approved strategy verified","The audience, buyer roles and commercial angle are ready for company research.");
    await databaseRequest("rpc/update_company_discovery_progress",{method:"POST",body:JSON.stringify({p_session_id:job.session_id,p_stage:"ANALYSING",p_progress:40})});
    await activity(job.session_id,"RESEARCHING","Searching for matching companies","SalesPilot is researching public company information and official websites.");

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
    });

    await databaseRequest("rpc/update_company_discovery_progress",{method:"POST",body:JSON.stringify({p_session_id:job.session_id,p_stage:"VALIDATING",p_progress:72,p_candidates:result.companies.length})});
    await activity(job.session_id,"CANDIDATES_FOUND",`${result.companies.length} potential matches found`,"Each company is now being checked against official-site evidence.",{candidateCount:result.companies.length});

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
      await databaseRequest("rpc/update_company_discovery_progress",{method:"POST",body:JSON.stringify({p_session_id:job.session_id,p_stage:"VALIDATING",p_progress:Math.min(85,validationProgress),p_candidates:result.companies.length})});
      const verification=await verifyDiscoveredCompanyDetailed(candidate);
      reachableOfficialEvidence += verification.diagnostics.officialEvidenceReachable;
      excerptMatches += verification.diagnostics.excerptMatches;
      if (!verification.accepted) {
        heldReasons[verification.reason] += 1;
        await activity(job.session_id,"CANDIDATE_HELD",`${candidate.name} held back`,"The available official-site evidence was not strong enough to recommend this company.",{companyName:candidate.name,reason:verification.reason,diagnostics:verification.diagnostics});
        continue;
      }
      const company=verification.company;
      verified+=1;
      const saveProgress=86+Math.round((verified/result.companies.length)*9);
      await databaseRequest("rpc/update_company_discovery_progress",{method:"POST",body:JSON.stringify({p_session_id:job.session_id,p_stage:"SAVING",p_progress:Math.min(95,saveProgress),p_candidates:result.companies.length})});
      const count=await databaseRequest<number>("rpc/save_company_discovery_batch",{method:"POST",body:JSON.stringify({p_session_id:job.session_id,p_companies:[company]})});
      saved+=Number(count);
      // COMPANY_VERIFIED quality gate completed before the persisted COMPANY_SAVED activity.
      await activity(job.session_id,"COMPANY_SAVED",`${company.name} verified and added`,`${company.matchLabel} · ${company.confidence}/100 confidence · ${company.evidenceQuality}/100 evidence quality`,{companyName:company.name,confidence:company.confidence,evidenceQuality:company.evidenceQuality,savedCount:saved});
    }
    // A valid search can legitimately produce no new unique, evidence-backed
    // companies after exclusions and verification. Finalise that cycle so the
    // database can apply its exhaustion cooldown instead of treating it as a
    // transient worker failure and immediately reopening it on the next tick.
    const discoverySummary = {
      ...createResultSummary(Number(saved)>0?"COMPLETED_WITH_RESULTS":"COMPLETED_NO_RESULTS",Number(saved),startedAt),
      candidatesReturned: result.companies.length,
      candidatesVerified: verified,
      candidatesHeld: result.companies.length - verified,
      reachableOfficialEvidence,
      excerptMatches,
      heldReasons,
    };
    await activity(job.session_id,"DISCOVERY_SUMMARY",saved > 0 ? `${saved} companies ready for review` : "No companies met the evidence gate",saved > 0 ? `${verified} verified from ${result.companies.length} candidates.` : "The search completed normally. Candidate diagnostics have been saved for tuning.",discoverySummary);
    const finalSaved=await databaseRequest<number>("rpc/finalize_company_discovery",{method:"POST",body:JSON.stringify({p_session_id:job.session_id,p_result_summary:discoverySummary})});
    return {
      worker: "COMPANY_DISCOVERY",
      processed: true,
      outcome: Number(finalSaved) > 0 ? "COMPLETED_WITH_RESULTS" : "COMPLETED_NO_RESULTS",
      sessionId: job.session_id,
      saved: Number(finalSaved),
    };
  } catch (error) {
    const safeMessage=safeWorkerError(error);
    const classified=classifyPipelineError(error);
    await activity(
      job.session_id,
      "DISCOVERY_FAILED",
      "Company discovery paused",
      classified.code === "INVALID_AI_OUTPUT"
        ? "The research response did not complete cleanly, so SalesPilot held back every recommendation and scheduled a safe retry."
        : "SalesPilot could not complete this attempt. No unverified recommendations were marked ready.",
      { errorCode: classified.code },
    ).catch(()=>undefined);
    await databaseRequest("rpc/record_company_discovery_failure",{method:"POST",body:JSON.stringify({p_session_id:job.session_id,p_error_code:classified.code,p_error_message:safeMessage,p_retryable:classified.retryable})}).catch(()=>undefined);
    throw error;
  }
}

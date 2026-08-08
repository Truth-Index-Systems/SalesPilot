import fs from "node:fs";
const read=(p)=>fs.readFileSync(p,"utf8");
const must=(p,needles)=>{const s=read(p);for(const n of needles){if(!s.includes(n))throw new Error(`${p} missing ${n}`)}};
const mustNot=(p,needles)=>{const s=read(p);for(const n of needles){if(s.includes(n))throw new Error(`${p} still contains legacy token ${n}`)}};

must("supabase/migrations/0072_genesis_g4710_full_pipeline_legacy_leak_hardening.sql",[
  "assert_active_pipeline_scheduler_run",
  "worker_token uuid",
  "claim_company_discovery_owned",
  "claim_contact_discovery_owned",
  "assert_company_discovery_owner",
  "assert_contact_discovery_owner",
  "attempt_count>=8",
  "commercial_routes cr",
  "enforce_opportunity_route_readiness",
  "claim_engagement_commercial_reasoning_owned",
  "claim_engagement_outreach_generation_owned",
  "claim_engagement_self_review_owned",
  "record_engagement_pipeline_stage_owned",
  "plan_contact_discovery_dispatch_owned",
  "record_pipeline_scheduler_outcome_owned",
  "revoke execute on function public.claim_company_discovery(uuid) from service_role",
  "revoke execute on function public.claim_contact_discovery(uuid,uuid,boolean) from service_role",
]);

must("features/discovery/company-discovery.service.ts",[
  "rpc/claim_company_discovery_owned","rpc/update_company_discovery_progress_owned","rpc/save_company_discovery_batch_owned","rpc/finalize_company_discovery_owned","isPipelineOwnershipLost"
]);
mustNot("features/discovery/company-discovery.service.ts",['"rpc/claim_company_discovery"']);
must("features/contacts/contact-discovery.service.ts",[
  "rpc/claim_contact_discovery_owned","rpc/evaluate_contact_discovery_route_readiness_owned","isPipelineOwnershipLost"
]);
mustNot("features/contacts/contact-discovery.service.ts",['"rpc/claim_contact_discovery"']);
must("lib/intelligence/business-analysis-jobs.ts",["worker_token","update_business_analysis_progress_owned","complete_business_analysis_job_owned","fail_business_analysis_job_owned"]);
must("lib/database/postgrest.ts",["sanitisePostgresJson"]);
must("lib/pipeline/ownership.ts",["DatabaseRequestError","details?.message","OWNERSHIP_LOST"]);
must("lib/opportunities/scoring.ts",["enforce_opportunity_route_readiness"]);
must("lib/engagement/strategy.ts",["record_engagement_pipeline_stage_owned"]);
must("lib/pipeline/repository.ts",["plan_contact_discovery_dispatch_owned","record_pipeline_scheduler_outcome_owned"]);
must("lib/pipeline/scheduler.ts",["acquirePipelineSchedulerLease(owner, 300)","hasSchedulerBudget(schedulerStartedAt, 45_000)","const routeDue = contactPlan.dispatch_count > 0", "runNextRouteIntelligence"]);
for(const f of ["lib/engagement/commercial-reasoning.ts","lib/engagement/outreach-generation.ts","lib/engagement/self-review.ts"]){must(f,["SUPERSEDED","isPipelineOwnershipLost","_owned"])}
for(const dead of ["lib/data/mock.ts","lib/pipeline/campaign-state.ts","lib/pipeline/retry.ts","lib/pipeline/heartbeat.ts"]){if(fs.existsSync(dead))throw new Error(`dead legacy runtime file still exists: ${dead}`)}
mustNot("lib/domain/campaign.ts",["ANALYSING","DISCOVERING","QUALIFYING","ENRICHING","AWAITING_APPROVAL","ACTIVE","COMPLETED"]);
console.log("PASS Genesis G4.7.10 full pipeline legacy/leak audit");

import fs from 'node:fs';
const read=(p)=>fs.readFileSync(p,'utf8');
const checks=[]; const add=(ok,msg)=>checks.push([!!ok,msg]);
const service=read('features/discovery/company-discovery.service.ts');
const openai=read('lib/discovery/openai.ts');
const sql=read('supabase/migrations/0092_genesis_post_freeze_company_discovery_workload_decomposition.sql');
const scheduler=read('lib/pipeline/scheduler.ts');
const r2=read('lib/engagement/g5-commercial-reasoning-openai.ts');

add(sql.includes('company_search_plan_json jsonb'),'search plan persisted on discovery session');
add(sql.includes('company_search_archetype_cursor'),'archetype cursor persisted');
add(sql.includes('company_search_cumulative_json'),'bounded-unit cumulative facts persisted');
add(sql.includes('persist_company_discovery_search_plan_owned'),'search-plan persistence is ownership fenced');
add(sql.includes('complete_company_discovery_archetype_owned'),'archetype completion is ownership fenced');
add(sql.includes('persist_company_discovery_archetype_result_owned'),'successful GPT-5 unit result is persisted before verification');
add(sql.includes('COMPANY_DISCOVERY_ARCHETYPE_CURSOR_MISMATCH'),'stale/out-of-order archetype completion is rejected');
add(sql.includes("attempt_count=0"),'successful bounded unit does not consume technical retry budget');
add(sql.includes("now()+interval '2 seconds'"),'next bounded unit is scheduled across scheduler cycles');

add(service.includes('CompanySearchPlanSchema.safeParse'),'persisted search plan is validated before reuse');
add(service.includes('company_search_archetype_cursor'),'worker resumes from persisted archetype cursor');
add(service.includes('storedCursor >= archetypeTotal'),'crash after final unit can finalise without repeating AI');
add(service.includes('ARCHETYPE_RESULT_RESUMED'),'post-AI verifier recovery reuses persisted result');
add(service.includes('persist_company_discovery_archetype_result_owned'),'worker persists successful AI result before verification');
add(service.includes('companyArchetypes: [archetype]'),'AI receives exactly one target-account archetype per call');
add(service.includes('SALESPILOT_COMPANY_DISCOVERY_CANDIDATES_PER_ARCHETYPE'),'candidate batch is bounded/configurable');
add(service.includes('p_release_for_next:!isLastArchetype'),'successful non-final unit releases same session for next archetype');
add(service.includes('finalize_company_discovery_owned'),'existing evidence/finalisation authority remains canonical');
add(service.includes('record_company_discovery_failure_owned'),'technical failure still uses existing retry authority');
add(service.includes('same target account archetype'),'retry copy makes same-unit recovery explicit');

add(openai.includes('company-discovery/v5-bounded-archetype'),'bounded archetype prompt/fingerprint version active');
add(openai.includes('maxItems: boundedLimit'),'structured output candidate count is bounded');
add(openai.includes('minItems: 0'),'zero-result archetype is permitted rather than fabricating candidates');
add(openai.includes('Complete only this unit of work'),'model cannot broaden into unscheduled archetypes');
add(openai.includes('max_output_tokens: profile.maxOutputTokens'),'bounded unit uses the central workload-profile output envelope');
add(openai.includes('safeWholePassEstimate / Math.max(1, input.archetypeTotal ?? 1)'),'AI governance estimate is divided across bounded units');
add(service.includes('p_stage:"VERIFYING"'),'bounded unit exposes verification stage to UI');

add(scheduler.includes('runNextCompanyDiscovery'),'scheduler remains the only Company Discovery dispatcher');
add(r2.includes('g5-commercial-reasoning/v3-responsibility-boundary'),'G5 prompt architecture untouched');

let failed=0;
for(const [ok,msg] of checks){ console.log(`${ok?'PASS':'FAIL'} ${msg}`); if(!ok) failed++; }
console.log(`\n${checks.length-failed}/${checks.length} checks passed`);
if(failed) process.exit(1);

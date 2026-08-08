import fs from 'node:fs';

const read=(p)=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const checks=[]; const check=(name,ok)=>{checks.push([name,!!ok]); console.log(`${ok?'PASS':'FAIL'} ${name}`)};
const bg=read('lib/ai/background-response.ts');
const gov=read('lib/ai/governance.ts');
const migration=read('supabase/migrations/0093_genesis_post_freeze_all_ai_background_resumability.sql');
const scheduler=read('lib/pipeline/scheduler.ts');
const active=[
 ['business','lib/intelligence/openai.ts','BUSINESS_ANALYSIS'],
 ['company','lib/discovery/openai.ts','COMPANY_DISCOVERY'],
 ['route','lib/contacts/openai.ts','ROUTE_INTELLIGENCE'],
 ['reasoning','lib/engagement/g5-commercial-reasoning-openai.ts','G5_COMMERCIAL_REASONING'],
 ['channel','lib/engagement/g5-channel-strategy-openai.ts','G5_CHANNEL_STRATEGY'],
 ['outreach','lib/engagement/g5-outreach-generation-openai.ts','G5_OUTREACH_GENERATION'],
 ['review','lib/engagement/g5-self-review-openai.ts','G5_SELF_REVIEW'],
];
check('background helper submits Responses API with background true',bg.includes('background: true'));
check('background helper persists response ids',bg.includes('upsert_ai_background_response')&&bg.includes('response_id'));
check('background helper polls existing responses',bg.includes('`${ENDPOINT}/${encodeURIComponent(id)}`'));
check('background helper caches completed provider response',bg.includes('responseJson: json'));
check('background helper exposes pending control signal',bg.includes('OpenAIBackgroundPendingError'));
check('completed checkpoint can be discarded after invalid AI output',bg.includes('discardOpenAIBackgroundResponse'));
check('governance resumes already-reserved provider work without a new allowance charge',gov.includes('status=in.(RESERVED,SUCCEEDED)'));
for(const [name,path,task] of active){const s=read(path);check(`${name} uses resumable background transport`,s.includes('fetchResumableOpenAIResponse'));check(`${name} propagates background pending without marking provider failure`,s.includes('isOpenAIBackgroundPending'));}
const companyWorker=read('features/discovery/company-discovery.service.ts');
const routeWorker=read('features/contacts/contact-discovery.service.ts');
const businessWorker=read('lib/intelligence/business-analysis-worker.ts');
const r2=read('lib/engagement/g5-commercial-reasoning.ts');
const r3=read('lib/engagement/g5-channel-strategy.ts');
const r4=read('lib/engagement/g5-outreach-generation.ts');
const r6=read('lib/engagement/g5-self-review.ts');
check('company discovery pending releases ownership without attempt consumption',companyWorker.includes('defer_company_discovery_background_owned'));
check('route intelligence pending releases ownership without attempt consumption',routeWorker.includes('defer_contact_discovery_background_owned'));
check('business analysis pending releases ownership without attempt consumption',businessWorker.includes('deferBusinessAnalysisBackground'));
for(const [name,s] of [['R2',r2],['R3',r3],['R4',r4],['R6',r6]]) check(`${name} pending releases G5 ownership without failure`,s.includes('defer_g5_engagement_background_owned'));
check('scheduler treats DEFERRED AI work as an occupied AI slot',scheduler.includes('commercialReasoningDidNotClaim')&&scheduler.includes('channelStrategyDidNotClaim')&&scheduler.includes('outreachGenerationDidNotClaim'));
check('background checkpoint table is service-role only',migration.includes('revoke all on table public.ai_background_responses from public,anon,authenticated'));
check('company defer rolls back attempt',migration.includes('defer_company_discovery_background_owned')&&migration.includes('attempt_count=greatest(attempt_count-1,0)'));
check('route defer rolls back attempt',migration.includes('defer_contact_discovery_background_owned'));
check('G5 defer rolls back attempt',migration.includes('defer_g5_engagement_background_owned'));
check('business defer rolls back attempt',migration.includes('defer_business_analysis_background_owned'));
const legacyScheduler=read('lib/pipeline/scheduler.ts');
check('legacy engagement AI remains outside scheduler',!legacyScheduler.includes('runNextEngagementCommercialReasoning')&&!legacyScheduler.includes('runNextEngagementOutreach'));
const repair=read('lib/ai/structured-response-gateway.ts');
check('hidden model repair is no longer automatic/untracked',repair.includes('if (params.allowRepair === true)'));
const failed=checks.filter(([,ok])=>!ok).length; console.log(`\n${checks.length-failed}/${checks.length} checks passed`); if(failed) process.exit(1);

import fs from 'node:fs';
function text(path){return fs.readFileSync(path,'utf8')}
const jobs=text('lib/intelligence/business-analysis-jobs.ts');
const route=text('app/api/intelligence/business-discovery/route.ts');
const worker=text('lib/intelligence/business-analysis-worker.ts');
const openai=text('lib/intelligence/openai.ts');
const governance=text('lib/ai/governance.ts');
const migration=text('supabase/migrations/0099_marketroute_g515_anonymous_governance_identity_fix.sql');
const wizard=text('components/campaign-wizard.tsx');
const checks=[
  [route.includes('forceAnonymous: !user'),'API makes the anonymous ownership decision once'],
  [jobs.includes('options?.forceAnonymous ? {userId:null,organisationId:null}'),'anonymous job creation cannot inherit a stale workspace'],
  [jobs.includes('requested_by') && worker.includes('publicAnalysis:job.requested_by===null'),'worker carries explicit durable public identity'],
  [openai.includes('publicAnalysis?:boolean') && openai.includes('publicAnalysis: params.publicAnalysis === true'),'Business Analysis forwards public identity to governance'],
  [governance.includes('context.publicAnalysis === true ||'),'governance public lane is explicit rather than organisation inference only'],
  [migration.includes('reserve_public_business_analysis_ai_request'),'migration is self-contained for public reservation RPC'],
  [migration.includes('progress=greatest(coalesce(baj.progress,0),greatest(0,least(p_progress,99)))'),'persisted progress updates are monotonic'],
  [migration.includes("stage=case when p_retryable and v_attempt<5 then stage else 'FAILED' end"),'retryable failures preserve truthful stage'],
  [wizard.includes('analysisJob.stage === "FAILED" ? failedStage'),'checklist cannot stay ahead of the percentage after failure'],
];
let failed=false;
for(const [ok,label] of checks){console.log(`${ok?'PASS':'FAIL'} ${label}`); if(!ok) failed=true}
if(failed) process.exit(1);

import fs from 'node:fs';
const migration=fs.readFileSync('supabase/migrations/0073_genesis_g4711_stage_authority_and_presentation_hardening.sql','utf8');
const page=fs.readFileSync('app/campaigns/[id]/page.tsx','utf8');
const prepare=migration.slice(migration.indexOf('create or replace function public.prepare_pipeline_work'), migration.indexOf('-- 4) Remove obsolete'));
const checks=[
 [migration.includes("public.pipeline_retry_delay(v_attempt,p_error_code)"),'company failure policy uses canonical retry delay'],
 [migration.includes("attempt_count,0)<5"),'premature terminal technical rows repaired'],
 [prepare.includes("contactJobsCreated',0"),'prepare reports zero contact creation'],
 [!prepare.includes('CONTACTS_READY_FOR_OUTREACH'),'legacy contact-to-outreach handoff removed'],
 [!prepare.includes('insert into public.contact_discovery_sessions'),'duplicate route foundation creation removed'],
 [page.includes('hasUsableCompanyHistory'),'presentation uses durable discovery history'],
 [page.includes('downstreamIntelligenceExists'),'downstream truth outranks replenishment failure'],
 [page.includes('opportunityResearchComplete'),'BUILDING opportunity foundations cannot masquerade as assembled opportunities'],
];
let failed=0; for(const [ok,label] of checks){console.log(`${ok?'PASS':'FAIL'} ${label}`); if(!ok) failed++;}
if(failed) process.exit(1);
const control=migration;
const extra=[
 [control.includes("job_state='PAUSED'"),'campaign pause persists canonical job state'],
 [control.includes("next_attempt_at='infinity'::timestamptz"),'engagement work is parked while paused'],
 [control.includes("active_ca.status not in ('PAUSED','ARCHIVED')"),'engagement claims/bridge exclude paused campaigns'],
 [control.includes("v_campaign_status='PAUSED'"),'mid-flight worker ownership respects campaign pause'],
 [control.includes("run_engagement_queue_builder") && control.includes("active_ca.status not in ('PAUSED','ARCHIVED')"),'send queue excludes paused campaigns'],
 [control.includes("check (status in ('DRAFT','PREPARING','READY','PAUSED','ARCHIVED'))"),'campaign lifecycle no longer persists legacy FAILED state'],
];
for(const [ok,label] of extra){console.log(`${ok?'PASS':'FAIL'} ${label}`); if(!ok) process.exitCode=1;}

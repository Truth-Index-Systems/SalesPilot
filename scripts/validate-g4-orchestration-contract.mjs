import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const migration=read('supabase/migrations/0061_genesis_g4_orchestration_state_contract_hardening.sql');
const ticker=read('components/discovery-activity-ticker.tsx');
const checks=[
 [migration.includes("drop constraint if exists discovery_sessions_stage_check"),'legacy stage constraint removed'],
 [migration.includes("'TECHNICAL_RETRY','NEEDS_ATTENTION'"),'new technical stages allowed'],
 [migration.includes("stage=case when target.attempt_count>=5 then 'NEEDS_ATTENTION' else 'TECHNICAL_RETRY' end"),'lease recovery preserves technical semantics'],
 [migration.includes('claimed_at=null'),'stale ownership cleared'],
 [migration.includes("s.status='FAILED' and s.job_state='FAILED_RETRYABLE'"),'due technical retry claim explicit'],
 [migration.includes("when s.status='FAILED' and s.job_state='FAILED_RETRYABLE' then 0"),'due retries prioritised'],
 [ticker.includes('updatedAt:discovery?.updated_at'),'database update timestamp watched'],
 [ticker.includes('attempts:discovery?.attempt_count'),'attempt transitions watched'],
 [ticker.includes('errorCode:discovery?.last_error_code'),'failure transitions watched'],
];
for(const [ok,msg] of checks){if(!ok)throw new Error(`FAIL: ${msg}`);console.log(`PASS: ${msg}`)}

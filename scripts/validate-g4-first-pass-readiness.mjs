import fs from 'node:fs';
const migration=fs.readFileSync('supabase/migrations/0058_genesis_g4_first_pass_readiness.sql','utf8');
const page=fs.readFileSync('app/campaigns/[id]/page.tsx','utf8');
const presentation=fs.readFileSync('lib/pipeline/presentation.ts','utf8');
const checks=[
  [migration.includes("s.status='QUEUED' and coalesce(s.next_attempt_at,now())<=now()"),'queued claim uses next_attempt_at'],
  [migration.includes("s.status='FAILED' and s.job_state='FAILED_RETRYABLE'"),'retry claim is explicit'],
  [migration.includes('next_retry_at=null'),'stale retry is cleared'],
  [presentation.includes('isJobPreparingFirstPass'),'preparation helper exists'],
  [page.includes('MarketRoute is preparing company discovery.'),'preparation headline exists'],
  [page.includes('No retry has occurred.'),'preparation copy distinguishes retry'],
];
for(const [ok,label] of checks){ if(!ok) throw new Error(`Missing: ${label}`); }
console.log('G4 first-pass readiness validation passed');

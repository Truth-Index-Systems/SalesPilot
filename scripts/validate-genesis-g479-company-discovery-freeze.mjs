import fs from 'node:fs';

function read(path){ return fs.readFileSync(path,'utf8'); }
function must(condition,message){ if(!condition) throw new Error(message); }

const migration=read('supabase/migrations/0071_genesis_g479_company_discovery_legacy_recovery_leak.sql');
const page=read('app/campaigns/[id]/page.tsx');
const repo=read('lib/discovery/repository.ts');
const status=read('app/api/campaigns/[id]/discovery/status/route.ts');

must(migration.includes('Recovery is intentionally NOT performed here'), 'prepare_pipeline_work must not recover leases');
must(!migration.includes("update public.discovery_sessions\n  set status='FAILED',stage='PREPARING'"), 'legacy discovery recovery block leaked into effective prepare function');
must(migration.includes("set status='QUEUED',job_state='QUEUED',stage='PREPARING'"), 'replenishment must reset canonical job_state');
must(migration.includes('create or replace function public.retry_company_discovery'), 'manual retry RPC must be replaced');
must(migration.includes("job_state='QUEUED'"), 'manual retry must reset canonical job_state');
must(migration.includes("where status='FAILED'\n  and job_state='RUNNING'"), 'impossible split-state repair missing');
must(page.includes('blockingDiscoveryNeedsAttention'), 'campaign page must distinguish blocking discovery failure');
must(page.includes('backgroundDiscoveryNeedsAttention'), 'campaign page must distinguish replenishment failure');
must(page.includes('Company replenishment paused'), 'non-blocking replenishment diagnostic missing');
must(page.includes('routeHandoffReady'), 'route handoff must not depend on discovery completion state');
must(repo.includes('order=cycle_number.desc,updated_at.desc,created_at.desc&limit=1'), 'discovery repository must select deterministic current state');
must(status.includes('order=cycle_number.desc,updated_at.desc,created_at.desc&limit=1'), 'discovery status API must select deterministic current state');

console.log('G4.7.9 company discovery legacy recovery/freeze checks passed');

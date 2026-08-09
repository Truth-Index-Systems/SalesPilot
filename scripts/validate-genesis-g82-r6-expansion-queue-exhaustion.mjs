import fs from 'node:fs';
const p='supabase/migrations/0126_genesis_g82_r6_expansion_queue_exhaustion_recovery.sql';
const s=fs.readFileSync(p,'utf8');
let n=0;
function pass(name,ok){if(!ok)throw new Error(`FAIL: ${name}`); console.log(`PASS ${++n}: ${name}`)}
pass('migration exists',s.includes('Genesis G8.2 R6'));
pass('exhausted threshold retained',s.includes('attempt_count >= 8'));
pass('exhausted queued jobs terminalised',/status='FAILED'[\s\S]*j\.status='QUEUED'/.test(s));
pass('exhaustion reason persisted',s.includes('GENESIS_G82_EXPANSION_ATTEMPTS_EXHAUSTED'));
pass('backlog ignores exhausted queued jobs',s.includes("j.status='QUEUED' and j.attempt_count < 8"));
pass('active claimed work still blocks duplicate backlog',s.includes("j.status='CLAIMED' and (j.lease_expires_at is null or j.lease_expires_at >= now())"));
pass('expired exhausted claims can be terminalised',s.includes("j.status='CLAIMED' and (j.lease_expires_at is null or j.lease_expires_at < now())"));
pass('claim still excludes exhausted jobs',s.includes('and j.attempt_count < 8'));
pass('claim cleanup is defensive',s.split('create or replace function public.claim_genesis_g82_expansion_jobs')[1]?.includes("status='FAILED'"));
pass('service role grants preserved',s.includes('grant execute on function public.ensure_genesis_g82_expansion_backlog(integer) to service_role'));
pass('PostgREST reload requested',s.includes("notify pgrst, 'reload schema'"));
console.log(`R6 validation ${n}/${n}`);

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const migration = fs.readFileSync(path.join(root,'supabase/migrations/0130_genesis_g82_mrti2_build8_2_cold_start_bootstrap.sql'),'utf8');
const worker = fs.readFileSync(path.join(root,'lib/genesis-g8/autonomous-expansion-worker.ts'),'utf8');
let passed = 0;
function pass(name, condition){ if(!condition) throw new Error(`FAIL: ${name}`); console.log(`PASS: ${name}`); passed++; }

pass('replaces backlog RPC', migration.includes('create or replace function public.ensure_genesis_g82_expansion_backlog'));
pass('self-heals expansion targets', migration.includes('insert into public.genesis_g82_expansion_targets'));
pass('uses idempotent seed', migration.includes('on conflict on constraint genesis_g82_expansion_targets_industry_key_key do nothing'));
pass('seeds software', migration.includes("('software','Software & SaaS',100,10000,true)"));
pass('seeds logistics', migration.includes("('logistics','Logistics & Supply Chain',80,7000,true)"));
pass('seeds ten canonical targets', (migration.match(/true\)/g) ?? []).length >= 10);
pass('preserves exhausted job recovery', migration.includes('GENESIS_G82_EXPANSION_ATTEMPTS_EXHAUSTED'));
pass('still creates expansion jobs', migration.includes('insert into public.genesis_g82_expansion_jobs'));
pass('still excludes active queued jobs', migration.includes("j.status='QUEUED' and j.attempt_count < 8"));
pass('service role execution preserved', migration.includes('grant execute on function public.ensure_genesis_g82_expansion_backlog(integer) to service_role'));
pass('worker calls ensure before claim', worker.indexOf('await ensureGenesisG82ExpansionBacklog(limit)') < worker.indexOf('rpc/claim_genesis_g82_expansion_jobs'));
pass('application fallback detects missing targets', worker.includes('genesis_g82_expansion_targets?select=id&limit=1'));
pass('application fallback seeds canonical targets', worker.includes('GENESIS_G82_CANONICAL_EXPANSION_TARGETS'));
pass('application fallback is idempotent', worker.includes('resolution=ignore-duplicates,return=minimal'));
pass('application fallback retries backlog RPC', (worker.match(/rpc\/ensure_genesis_g82_expansion_backlog/g) ?? []).length >= 2);
pass('no destructive target truncate/delete', !/truncate\s+(table\s+)?public\.genesis_g82_expansion_targets|delete\s+from\s+public\.genesis_g82_expansion_targets/i.test(migration));

console.log(`\nMR-TI-2 Build 8.2 cold-start validation: ${passed}/16 passed`);

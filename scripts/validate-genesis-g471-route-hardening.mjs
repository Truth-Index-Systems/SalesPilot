import fs from 'node:fs';
function read(p){return fs.readFileSync(p,'utf8')}
const scheduler=read('lib/pipeline/scheduler.ts');
const ai=read('lib/contacts/openai.ts');
const worker=read('features/contacts/contact-discovery.service.ts');
const sql=read('supabase/migrations/0066_genesis_g47_route_intelligence_timeout_and_memory.sql');
const failures=[];
if(/Promise\.all\([\s\S]{0,500}runNextRouteIntelligence/.test(scheduler))failures.push('route intelligence still uses parallel first-pass burst');
if(!scheduler.includes('one deep route investigation per scheduler'))failures.push('sequential route comment missing');
if(!ai.includes('240_000'))failures.push('first-pass timeout not hardened');
if(!ai.includes('priorRouteMemory'))failures.push('prior route memory prompt missing');
if(!worker.includes('rpc/get_route_intelligence_memory'))failures.push('route memory not loaded by worker');
if(!sql.includes('create or replace function public.get_route_intelligence_memory'))failures.push('route memory RPC missing');
if(failures.length){console.error(failures.join('\n'));process.exit(1)}
console.log('Genesis G4.7.1 route timeout/memory hardening validation passed.');

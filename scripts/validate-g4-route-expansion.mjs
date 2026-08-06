import fs from 'node:fs';
const root=new URL('../',import.meta.url);
const sql=fs.readFileSync(new URL('supabase/migrations/0057_genesis_g4_universal_route_expansion.sql',root),'utf8');
const service=fs.readFileSync(new URL('features/contacts/contact-discovery.service.ts',root),'utf8');
const ai=fs.readFileSync(new URL('lib/contacts/openai.ts',root),'utf8');
const checks=[
 ['four-pass cap',sql.includes('route_expansion_pass between 0 and 4')],
 ['primary and fallback gate',sql.includes('primary_route_ready')&&sql.includes('fallback_route_ready')],
 ['bounded requeue',sql.includes("now()+interval '15 seconds'")],
 ['universal recovery',sql.includes('Resume all live, non-exhausted route sessions')],
 ['service evaluates readiness',service.includes('evaluate_contact_discovery_route_readiness')],
 ['expansion outcome',service.includes('ROUTE_EXPANSION_QUEUED')],
 ['pass-aware AI research',ai.includes('routeExpansionPass')&&ai.includes('final safe expansion pass')],
];
for(const [name,ok] of checks){if(!ok){console.error(`FAIL: ${name}`);process.exitCode=1}else console.log(`PASS: ${name}`)}

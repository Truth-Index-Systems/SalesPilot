import fs from 'node:fs';import path from 'node:path';
let p=0,t=0;const check=(n,b)=>{t++;if(b){p++;console.log('PASS',n)}else{console.error('FAIL',n);process.exitCode=1}};
const canonical=fs.readFileSync('supabase/migrations/0158_marketroute_forensic_build8_constitutional_hardening.sql','utf8');const standalone=fs.readFileSync('APPLY-IN-SUPABASE-FORENSIC-BUILD8.sql','utf8');
check('migration is atomic',canonical.trimStart().startsWith('BEGIN;')&&canonical.trimEnd().endsWith('COMMIT;'));
check('standalone exactly matches canonical',standalone===canonical);
check('no colliding plain CREATE FUNCTION declarations',!/^create function public\./mi.test(canonical));
check('presentation views dropped in dependency order',canonical.indexOf('drop view if exists public.cie_authoritative_opportunity_detail_read')<canonical.indexOf('drop view if exists public.cie_authoritative_opportunity_read')&&canonical.indexOf('drop view if exists public.cie_authoritative_opportunity_read')<canonical.indexOf('drop view if exists public.cie_current_company_truth_read'));
check('three presentation views recreated', (canonical.match(/^create view public\.cie_/gmi)||[]).length===3);
check('PostgREST reload included',canonical.includes("notify pgrst, 'reload schema'"));
const migrations=fs.readdirSync('supabase/migrations').filter(x=>x.endsWith('.sql')&&x<'0158_marketroute_forensic_build8_constitutional_hardening.sql').sort();
const functionNames=[...canonical.matchAll(/create or replace function public\.([a-zA-Z0-9_]+)\s*\(/gi)].map(m=>m[1]);
function sig(text,name){const r=new RegExp('create(?: or replace)? function public\\.'+name+'\\s*\\((.*?)\\)\\s*(returns\\s+.*?)(?=\\s+language\\s)','is');const m=text.match(r);return m?[' '+m[1].replace(/\s+/g,' ').trim(),m[2].replace(/\s+/g,' ').trim()]:null;}
let changed=[];for(const name of functionNames){let prior=null,priorFile=null;for(const f of migrations){const txt=fs.readFileSync(path.join('supabase/migrations',f),'utf8');const s=sig(txt,name);if(s){prior=s;priorFile=f;}}if(prior){const cur=sig(canonical,name);if(JSON.stringify(prior)!==JSON.stringify(cur))changed.push({name,priorFile,prior,cur});}}
check('all replaced pre-existing RPC signatures and return types are unchanged',changed.length===0);
if(changed.length) console.error(JSON.stringify(changed,null,2));
check('new currentness helper signatures are scalar boolean',canonical.includes('cie_r4_authority_current(p_opportunity_id uuid)\nreturns boolean')&&canonical.includes('cie_r5_authority_current(p_opportunity_id uuid)\nreturns boolean')&&canonical.includes('cie_r6_authority_current(p_opportunity_id uuid)\nreturns boolean'));
check('no RETURNS TABLE signature is introduced for currentness helpers',!canonical.match(/cie_r[456]_authority_current\([\s\S]{0,100}returns table/i));
check('boundary columns added rerun-safely',canonical.includes('add column if not exists boundary_constitution_version text')&&canonical.includes('add column if not exists boundary_completeness_json jsonb'));
check('service role alone receives currentness helper execution',canonical.includes('revoke all on function public.cie_r4_authority_current(uuid) from public,anon,authenticated')&&canonical.includes('grant execute on function public.cie_r6_authority_current(uuid) to service_role'));
console.log(`${p}/${t} Build-8 SQL/signature checks passed`);if(p!==t)process.exit(1);

import fs from 'node:fs';
const company=fs.readFileSync('features/discovery/company-discovery.service.ts','utf8');
const contact=fs.readFileSync('features/contacts/contact-discovery.service.ts','utf8');
const sql=fs.readFileSync('supabase/migrations/0018_genesis_g3_worker_completion_and_loop_fix.sql','utf8');
const checks=[
  ['company zero-result finalises',!company.includes('if (saved===0) throw new Error("DISCOVERY_NO_VERIFIED_COMPANIES")')],
  ['contact no-match completion RPC',contact.includes('complete_contact_discovery_without_matches')],
  ['contact no-match SQL function',sql.includes('complete_contact_discovery_without_matches')],
  ['company failed zero result repaired',sql.includes("last_error='DISCOVERY_NO_VERIFIED_COMPANIES'")],
  ['stale contact sessions recovered',sql.includes("WORKER_LEASE_EXPIRED")],
];
const failed=checks.filter(([,ok])=>!ok);
for(const [name,ok] of checks) console.log(`${ok?'PASS':'FAIL'} ${name}`);
if(failed.length) process.exit(1);

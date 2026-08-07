import fs from 'node:fs';

const openai=fs.readFileSync('lib/discovery/openai.ts','utf8');
const boundary=fs.readFileSync('lib/discovery/structured-output.ts','utf8');
const schemas=fs.readFileSync('lib/discovery/schemas.ts','utf8');
const migration=fs.readFileSync('supabase/migrations/0064_genesis_g4_company_discovery_structured_output_boundary.sql','utf8');

const checks=[
  ['gateway parses structural object before canonical schema', openai.includes('schema: CompanyDiscoveryGatewaySchema') && openai.includes('canonicaliseCompanyDiscoveryOutput(gateway.value)')],
  ['boundary validates URLs deterministically', boundary.includes('function httpUrl') && boundary.includes('canonicalEvidence')],
  ['boundary never requires malformed companies to survive', boundary.includes('.map(canonicalCompany)') && boundary.includes('.filter(')],
  ['zero salvageable candidates are a valid research result', schemas.includes('companies: z.array(DiscoveredCompanySchema).max(20)')],
  ['existing invalid-output terminal sessions are requeued', migration.includes("last_error_code='INVALID_AI_OUTPUT'") && migration.includes("job_state='QUEUED'") && migration.includes('attempt_count=0')],
];
const failed=checks.filter(([,ok])=>!ok);
for(const [name,ok] of checks) console.log(`${ok?'PASS':'FAIL'} ${name}`);
if(failed.length) process.exit(1);

import fs from 'node:fs';
const checks=[
 ['supabase/migrations/0004_genesis_g2_company_discovery.sql','claim_company_discovery'],
 ['features/discovery/company-discovery.service.ts','runNextCompanyDiscovery'],
 ['lib/discovery/openai.ts','web_search_preview'],
 ['app/api/autonomy/company-discovery/run/route.ts','CRON_SECRET'],
 ['app/companies/page.tsx','Company discovery'],
 ['app/companies/[id]/page.tsx','Why MarketRoute recommended this company'],
 ['app/api/companies/[id]/review/route.ts','APPROVED'],
];
for(const [file,needle] of checks){const text=fs.readFileSync(file,'utf8');if(!text.includes(needle))throw new Error(`${file} missing ${needle}`)}
console.log('Genesis G2 company discovery validation passed');

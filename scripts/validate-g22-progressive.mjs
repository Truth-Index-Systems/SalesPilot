import fs from 'node:fs';
const must=[
 ['supabase/migrations/0006_genesis_g22_progressive_discovery.sql','save_company_discovery_batch'],
 ['features/discovery/company-discovery.service.ts','COMPANY_SAVED'],
 ['components/discovery-activity-ticker.tsx','SalesPilot is working'],
 ['app/api/campaigns/[id]/discovery/status/route.ts','companyCount'],
 ['app/campaigns/[id]/page.tsx','DiscoveryActivityTicker'],
];
for(const [file,text] of must){const body=fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8');if(!body.includes(text))throw new Error(`${file} missing ${text}`)}
console.log('Genesis G2.2 progressive discovery validation passed');

import fs from 'node:fs';
const checks = [
 ['features/campaigns/campaign-launch.service.ts','rpc/launch_campaign'],
 ['app/api/campaigns/launch/route.ts','requireOrganisationContext'],
 ['lib/campaigns/repository.ts','requireOrganisationContext'],
 ['supabase/migrations/0002_genesis_g11_production_campaign_launch.sql',"'CampaignCreated'"],
 ['supabase/migrations/0002_genesis_g11_production_campaign_launch.sql','enable row level security'],
 ['components/campaign-wizard.tsx','idempotencyStorageKey'],
];
for (const [file, needle] of checks) {
 const text=fs.readFileSync(file,'utf8');
 if(!text.includes(needle)) throw new Error(`${file} missing ${needle}`);
}
console.log('Genesis G1.1 static checks passed.');

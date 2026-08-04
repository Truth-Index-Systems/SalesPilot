import fs from "node:fs";
const required = [
  "app/api/campaigns/launch/route.ts",
  "lib/campaigns/schemas.ts",
  "lib/campaigns/repository.ts",
  "lib/campaigns/presenter.ts",
  "lib/database/config.ts",
  "lib/database/postgrest.ts",
  "supabase/migrations/0001_genesis_campaign_foundation.sql",
  "app/campaigns/[id]/page.tsx",
];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
const wizard=fs.readFileSync("components/campaign-wizard.tsx","utf8");
for (const token of ["/api/campaigns/launch","idempotencyKey","router.push","salespilot:campaign-draft:v1"]) if(!wizard.includes(token)) throw new Error(`Wizard missing ${token}`);
const home=fs.readFileSync("app/page.tsx","utf8");
if(home.includes("@/lib/data/mock") || home.includes("Estimated pipeline")) throw new Error("Overview still exposes mock campaign outcomes");
const list=fs.readFileSync("app/campaigns/page.tsx","utf8");
if(list.includes("@/lib/data/mock")) throw new Error("Campaign list still uses mock data");
const detail=fs.readFileSync("app/campaigns/[id]/page.tsx","utf8");
if(detail.includes("@/lib/data/mock")||detail.includes("Companies found")) throw new Error("Campaign detail still exposes mock progress");
const sql=fs.readFileSync("supabase/migrations/0001_genesis_campaign_foundation.sql","utf8");
for(const token of ["organisation_id","campaign_config_versions","domain_outbox","idempotency_records","launch_campaign","CampaignCreated","enable row level security","pg_advisory_xact_lock"]) if(!sql.includes(token)) throw new Error(`Migration missing ${token}`);
console.log("Campaign persistence validation passed");

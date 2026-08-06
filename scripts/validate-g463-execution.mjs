import fs from "node:fs";
const read=(p)=>fs.readFileSync(p,"utf8");
const checks=[
  ["supabase/migrations/0050_genesis_g463_channel_execution_experience.sql","record_engagement_execution"],
  ["supabase/migrations/0050_genesis_g463_channel_execution_experience.sql","engagement_execution_history"],
  ["components/engagement-execution-actions.tsx","Mark engagement complete"],
  ["components/engagement-execution-actions.tsx","Automatic email execution"],
  ["app/api/engagements/[id]/execution/route.ts","COMPLETED"],
  ["app/replies/[id]/page.tsx","Execute recommended engagement"],
];
let failed=false;for(const [file,needle] of checks){if(!read(file).includes(needle)){console.error(`Missing ${needle} in ${file}`);failed=true;}}
if(failed)process.exit(1);console.log("Genesis G4.6.3 execution checks passed.");

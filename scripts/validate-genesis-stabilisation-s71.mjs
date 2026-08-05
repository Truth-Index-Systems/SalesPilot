import fs from "node:fs";
const required=[
  "supabase/migrations/0026_genesis_stabilisation_s71_ai_governance_cost_control.sql",
  "lib/ai/governance.ts","lib/ai/governance-repository.ts","components/ai-governance-controls.tsx","app/api/internal/autonomy/governance/route.ts"
];
for(const file of required)if(!fs.existsSync(file))throw new Error(`Missing ${file}`);
const migration=fs.readFileSync(required[0],"utf8");
for(const token of ["ai_governance_policies","ai_usage_ledger","reserve_ai_request","complete_ai_request","autonomy_enabled"])if(!migration.includes(token))throw new Error(`Missing ${token}`);
for(const file of ["lib/discovery/openai.ts","lib/contacts/openai.ts","lib/intelligence/openai.ts"]){const text=fs.readFileSync(file,"utf8");if(!text.includes("reserveAiRequest")||!text.includes("completeAiRequest"))throw new Error(`Governance not wired: ${file}`);}
console.log("Genesis Stabilisation S7.1 AI governance contract passed.");

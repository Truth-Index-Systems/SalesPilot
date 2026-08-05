import fs from "node:fs";
const required = [
  "supabase/migrations/0027_genesis_stabilisation_s10_production_rollout.sql",
  "lib/pipeline/release.ts",
  "components/pipeline-release-controls.tsx",
  "app/api/internal/autonomy/repair/route.ts",
  "app/api/internal/autonomy/observation/route.ts",
  "docs/genesis-stabilisation/s10-production-rollout-runbook.md",
];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
const migration=fs.readFileSync(required[0],"utf8");
for (const token of ["repair_pipeline_state","start_pipeline_observation","complete_pipeline_observation","pipeline_release_readiness"]) if(!migration.includes(token)) throw new Error(`Missing S10 contract: ${token}`);
const vercel=JSON.parse(fs.readFileSync("vercel.json","utf8"));
if(vercel.crons?.length!==1 || vercel.crons[0].path!=="/api/autonomy/pipeline/run") throw new Error("S10 requires exactly one pipeline cron");
console.log("Genesis Stabilisation S10 validation passed.");

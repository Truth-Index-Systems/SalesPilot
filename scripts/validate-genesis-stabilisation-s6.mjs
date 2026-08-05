import fs from "node:fs";
const required=[
 "supabase/migrations/0024_genesis_stabilisation_s6_business_analysis_jobs.sql",
 "lib/intelligence/business-analysis-jobs.ts",
 "lib/intelligence/business-analysis-worker.ts",
 "app/api/intelligence/business-discovery/route.ts",
 "app/api/intelligence/business-discovery/run/route.ts",
 "docs/genesis-stabilisation/s6-persisted-business-analysis.md",
];
for(const file of required)if(!fs.existsSync(file))throw new Error(`Missing ${file}`);
const migration=fs.readFileSync(required[0],"utf8");
for(const token of ["business_analysis_jobs","claim_business_analysis_job","complete_business_analysis_job","fail_business_analysis_job","lease_expires_at","next_retry_at"]){if(!migration.includes(token))throw new Error(`Migration missing ${token}`)}
const wizard=fs.readFileSync("components/campaign-wizard.tsx","utf8");
for(const token of ["ANALYSIS_JOB_KEY","monitorAnalysisJob","business-discovery/run","analysisJob?.progress"]){if(!wizard.includes(token))throw new Error(`Wizard missing ${token}`)}
const oldRoute=fs.readFileSync("app/api/intelligence/business-discovery/route.ts","utf8");
if(oldRoute.includes("await readWebsite")||oldRoute.includes("await analyseBusiness"))throw new Error("Start route still performs synchronous analysis");
console.log("Genesis Stabilisation S6 validation passed.");

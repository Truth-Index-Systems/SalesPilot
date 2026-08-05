import fs from "node:fs";

const migration=fs.readFileSync("supabase/migrations/0014_genesis_g3_stage5_pipeline_automation.sql","utf8");
const worker=fs.readFileSync("features/discovery/company-discovery.service.ts","utf8");
const openai=fs.readFileSync("lib/discovery/openai.ts","utf8");
const pipeline=fs.readFileSync("app/api/autonomy/pipeline/run/route.ts","utf8");
const vercel=fs.readFileSync("vercel.json","utf8");

const checks=[
  [migration.includes("ensure_company_review_queue"),"continuous company queue function"],
  [migration.includes("v_pending>=v_floor"),"six-company queue floor"],
  [migration.includes("companies_keep_review_queue_healthy"),"review-triggered top up"],
  [migration.includes("refresh_campaign_contact_readiness"),"outreach readiness evaluation"],
  [migration.includes("CampaignContactsReadyForOutreach"),"outreach hand-off event"],
  [worker.includes("existingCompanies"),"existing-company exclusion query"],
  [openai.includes("excludedCompanies"),"OpenAI duplicate exclusion context"],
  [pipeline.includes("Promise.all"),"parallel company and contact workers"],
  [vercel.includes("/api/autonomy/pipeline/run"),"single pipeline cron"],
];
const failed=checks.filter(([ok])=>!ok);
if(failed.length){for(const [,name] of failed)console.error(`Missing: ${name}`);process.exit(1)}
console.log("G3 Stage 5 pipeline automation contract passed.");

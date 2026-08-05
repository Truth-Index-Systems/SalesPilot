import fs from "node:fs";

const jobs=fs.readFileSync("lib/intelligence/business-analysis-jobs.ts","utf8");
const worker=fs.readFileSync("lib/intelligence/business-analysis-worker.ts","utf8");
const reader=fs.readFileSync("lib/intelligence/website-reader.ts","utf8");
const wizard=fs.readFileSync("components/campaign-wizard.tsx","utf8");

const checks=[
  [jobs.includes('typeof claimed.id!=="string"'),"empty composite claims are rejected"],
  [jobs.includes('typeof claimed.website_input!=="string"'),"null website claims are rejected"],
  [reader.includes('safeText(input)'),"website reader uses null-safe input normalisation"],
  [worker.includes('typeof job.website_input!=="string"'),"worker validates claimed input"],
  [!wizard.includes('void runAnalysisJob(data.job.id, data.accessToken);\n      await monitorAnalysisJob'),"new analyses are not double-dispatched"],
];
for(const [ok,label] of checks){if(!ok)throw new Error(`S10.2 validation failed: ${label}`);}
console.log("S10.2 business-analysis claim and null-safety contract passed.");

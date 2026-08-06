import fs from "node:fs";
const required=["lib/ai/cost-repository.ts","app/internal/ai-costs/page.tsx"];
for(const file of required){if(!fs.existsSync(file)) throw new Error(`Missing ${file}`)}
const repo=fs.readFileSync("lib/ai/cost-repository.ts","utf8");
const page=fs.readFileSync("app/internal/ai-costs/page.tsx","utf8");
const autonomy=fs.readFileSync("app/internal/autonomy/page.tsx","utf8");
for(const text of ["averageActualCostUsd","highest","webSearches","prompt_version","campaign_name"]){if(!repo.includes(text)) throw new Error(`Cost repository missing ${text}`)}
for(const text of ["AI cost baseline","Cost by intelligence stage","Highest-cost requests","No test-mode behaviour"]){if(!page.includes(text)) throw new Error(`Cost page missing ${text}`)}
if(!autonomy.includes('/internal/ai-costs')) throw new Error("Autonomy page missing cost dashboard link");
console.log("SalesPilot AI Cost Optimisation Release A passed");

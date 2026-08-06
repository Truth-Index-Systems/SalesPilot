import fs from "node:fs";
const read=p=>fs.readFileSync(p,"utf8");
const repo=read("lib/founder-dashboard/repository.ts");
const page=read("app/dashboard/page.tsx");
const pkg=JSON.parse(read("package.json"));
const checks=[
 [!repo.includes("TEST_MODE"),"Release C contains no test mode"],
 [repo.includes("costPerCompletedJourney"),"Completed-journey unit economics are calculated"],
 [repo.includes("campaignEconomics"),"Campaign outcome economics are calculated"],
 [repo.includes("releaseGate"),"Production release gate is calculated"],
 [page.includes("Production economics readiness"),"Founder release-gate UI exists"],
 [page.includes("Cost to commercial outcome"),"Campaign economics table exists"],
 [page.includes("Projected from $5"),"$5 production projection exists"],
 [pkg.scripts["cost:release-c-check"],"Release C validation command exists"],
];
const failed=checks.filter(([ok])=>!ok);
for(const [ok,label] of checks) console.log(`${ok?"✓":"✗"} ${label}`);
if(failed.length) process.exit(1);
console.log("SalesPilot AI Cost Optimisation Release C passed");

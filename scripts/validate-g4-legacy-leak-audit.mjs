import fs from "node:fs";
const read=p=>fs.readFileSync(p,"utf8");
const checks=[
 [!fs.existsSync("components/api-lifecycle-refresh.tsx"),"obsolete global fetch monkey-patch removed"],
 [!read("app/layout.tsx").includes("ApiLifecycleRefresh"),"obsolete refresh is not mounted"],
 [!read("components/campaign-wizard.tsx").includes("accessToken=${"),"analysis token is not placed in a query string"],
 [read("components/campaign-wizard.tsx").includes("sessionStorage.getItem(ANALYSIS_JOB_KEY)"),"analysis capability token is session scoped"],
 [fs.existsSync("app/api/intelligence/business-discovery/status/route.ts"),"POST status boundary exists"],
 [!read("app/api/intelligence/business-discovery/route.ts").includes("searchParams.get(\"accessToken\")")&&!read("app/api/intelligence/business-discovery/route.ts").includes("getBusinessAnalysisJob(id"),"legacy token-bearing GET status route removed"],
 [!read("lib/engagement/outreach-generation.ts").includes("p_error: error instanceof Error ? error.message"),"outreach failures are sanitised before persistence"],
 [!read("lib/engagement/self-review.ts").includes("p_error: error instanceof Error ? error.message"),"review failures are sanitised before persistence"],
];
for(const [ok,label] of checks){if(!ok)throw new Error(`FAIL: ${label}`);console.log(`PASS: ${label}`)}

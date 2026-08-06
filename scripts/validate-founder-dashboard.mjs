import fs from "node:fs";
const required=[
  "app/dashboard/page.tsx","app/dashboard/login/page.tsx",
  "app/api/founder-dashboard/login/route.ts","app/api/founder-dashboard/logout/route.ts",
  "lib/founder-dashboard/auth.ts","lib/founder-dashboard/repository.ts"
];
for(const file of required) if(!fs.existsSync(file)) throw new Error(`Missing ${file}`);
const page=fs.readFileSync("app/dashboard/page.tsx","utf8");
const auth=fs.readFileSync("lib/founder-dashboard/auth.ts","utf8");
const repo=fs.readFileSync("lib/founder-dashboard/repository.ts","utf8");
for(const token of ["Founder Dashboard","Most expensive requests","Optimisation centre","Production timeline","hasFounderDashboardSession"]) if(!page.includes(token)) throw new Error(`Dashboard contract missing ${token}`);
for(const token of ["DASHBOARD_PASSWORD","timingSafeEqual","httpOnly","sameSite"]) if(!auth.includes(token)) throw new Error(`Auth contract missing ${token}`);
for(const token of ["ai_usage_ledger","engagement_learning_records","campaign_timeline","opportunity_engagements"]) if(!repo.includes(token)) throw new Error(`Repository contract missing ${token}`);
console.log("SalesPilot Founder Dashboard passed");

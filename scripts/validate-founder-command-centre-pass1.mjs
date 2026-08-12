import fs from "node:fs";
const page=fs.readFileSync("app/dashboard/page.tsx","utf8");
const repo=fs.readFileSync("lib/founder-dashboard/cie-command-centre.ts","utf8");
const css=fs.readFileSync("app/globals.css","utf8");
const tests=[
 ["Autonomous mission status",page.includes("Genesis is")&&page.includes("AUTONOMOUS")],
 ["Today throughput",page.includes("Intelligence throughput")&&repo.includes("throughput")],
 ["Expansion queue health",repo.includes("genesis_g82_expansion_jobs")&&page.includes("Industry breadth")],
 ["Depth queue health",repo.includes("genesis_g82_depth_jobs")&&page.includes("Contacts + routes")],
 ["Capacity ceiling visible",page.includes("Governed research envelope")&&page.includes("dailyCostLimitUsd")],
 ["Ten-industry map visible",page.includes("10-industry intelligence map")&&page.includes("industryResearch")],
 ["Recent persistence visible",repo.includes("recentDiscoveries")&&page.includes("Latest persisted discoveries")],
 ["System health visible",page.includes("Constitutional operating status")],
 ["No new commercial aggregate score",!page.includes("Commercial Intelligence Score")&&!page.includes("intelligenceScore")],
 ["No legacy opportunity scoring",!page.includes("Opportunity Score")&&!page.includes("opportunity_score")],
 ["No legacy route ranking",!page.includes("route_confidence")&&!page.includes("route_quality")],
 ["Read-only dashboard repository",!repo.includes("method:\"POST\"")&&!repo.includes("method: \"POST\"")],
 ["Responsive command-centre styling",css.includes(".cie-command-strip")&&css.includes(".cie-industry-grid")&&css.includes(".cie-health-grid")],
];
let failed=0; for(const [name,ok] of tests){console.log(`${ok?"PASS":"FAIL"} ${name}`);if(!ok)failed++;}
console.log(`Founder Command Centre Pass 1: ${tests.length-failed}/${tests.length}`); if(failed) process.exit(1);

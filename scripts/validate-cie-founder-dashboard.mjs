import fs from "node:fs";
const page=fs.readFileSync("app/dashboard/page.tsx","utf8");
const repo=fs.readFileSync("lib/founder-dashboard/cie-command-centre.ts","utf8");
const css=fs.readFileSync("app/globals.css","utf8");
const tests=[
  ["CIE command-centre title",page.includes("Commercial Intelligence Command Centre")],
  ["Research Density visible",page.includes("Research density")&&page.includes("Company knowledge density")],
  ["Commercial Reality visible",page.includes("Commercial Reality")&&page.includes("Reality state distribution")],
  ["Route/contact authority visible",page.includes("Route & contact authority")],
  ["Research intelligence visible",page.includes("What Genesis is researching now")],
  ["No opportunity score UI",!page.includes("opportunity_score")&&!page.includes("Opportunity score")],
  ["No route score UI",!page.includes("route_quality")&&!page.includes("route_confidence")],
  ["Dashboard reads authoritative R4",repo.includes("cie_r4_commercial_decisions")],
  ["Dashboard reads authoritative R6",repo.includes("cie_r6_contact_decisions")],
  ["Dashboard reads authoritative R7",repo.includes("cie_r7_research_directives")],
  ["Density uses Truth coverage",repo.includes("genesis_g8_truth_v2_snapshots")&&repo.includes("coverage>=99.5")],
  ["Cold-start queries fail soft",(repo.match(/\.catch\(\(\)=>\[\]\)/g)||[]).length>=6],
  ["CIE styles present",css.includes("CIE v1 Founder Command Centre")&&css.includes(".cie-hero-grid")],
];
let failed=0;for(const [name,ok] of tests){console.log(`${ok?"PASS":"FAIL"} ${name}`);if(!ok)failed++;}
console.log(`CIE founder dashboard: ${tests.length-failed}/${tests.length}`);if(failed)process.exit(1);

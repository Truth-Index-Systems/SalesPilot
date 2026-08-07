import fs from "node:fs";

const planner=fs.readFileSync("lib/discovery/search-plan.ts","utf8");
const discovery=fs.readFileSync("lib/discovery/openai.ts","utf8");
const service=fs.readFileSync("features/discovery/company-discovery.service.ts","utf8");
const verifier=fs.readFileSync("lib/discovery/site-verifier.ts","utf8");
const cost=fs.readFileSync("lib/ai/cost-optimisation.ts","utf8");

const checks=[
  [planner.includes('company-search-plan/v1'),"search-plan schema missing"],
  [planner.includes('must never call AI or the public internet'),"planning stage must remain deterministic"],
  [planner.includes('Official operations, facilities and locations pages'),"source-priority planning missing"],
  [service.includes('buildCompanySearchPlan'),"service does not build a search plan"],
  [service.indexOf('buildCompanySearchPlan') < service.indexOf('discoverCompanies({'),"search plan must run before discovery"],
  [discovery.includes('Return 10–12 diverse candidates'),"broad candidate pool missing"],
  [discovery.includes('search_context_size: "medium"'),"discovery search breadth is still low"],
  [discovery.includes('Search for companies experiencing the operating reality'),"problem-led search instruction missing"],
  [discovery.includes('Prioritise evidence in this order'),"source order instruction missing"],
  [cost.includes('searchPlan: input.searchPlan'),"search plan not included in discovery input"],
  [verifier.includes('Verify the evidence package first'),"verifier still treats homepage as mandatory first gate"],
  [verifier.includes('homepageReachable ? "NO_OFFICIAL_EVIDENCE" : "HOMEPAGE_UNREACHABLE"'),"homepage fallback result missing"],
];
const failed=checks.filter(([ok])=>!ok).map(([,message])=>message);
if(failed.length){console.error(failed.join("\n"));process.exit(1)}
console.log("G4 company search-order validation passed");

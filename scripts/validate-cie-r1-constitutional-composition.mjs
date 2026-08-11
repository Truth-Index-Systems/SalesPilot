import fs from "node:fs";
const file = fs.readFileSync("lib/genesis-t8/cie/composition.ts", "utf8");
const checks = [
  ["version", file.includes('CIE_COMPOSITION_VERSION = "1.0.0"')],
  ["assumes", file.includes("assumes:")], ["guarantees", file.includes("guarantees:")],
  ["owns", file.includes("owns:")], ["may-not-own", file.includes("mayNotOwn:")],
  ["shadow", file.includes('"SHADOW"')], ["single-authority", file.includes("assertSingleAuthority")],
  ["shadow-fail-closed", file.includes("SHADOW_CANNOT_CONTROL")],
  ["opportunity-map", file.includes("LIVE_OPPORTUNITY_SCORING")],
  ["contact-map", file.includes("CONTACT_WEIGHTED_AUTHORITY")],
  ["route-map", file.includes("ROUTE_WEIGHTED_AUTHORITY")],
  ["ai-route-map", file.includes("G5_AI_ROUTE_SELECTION")],
  ["engagement-map", file.includes("G5_ENGAGEMENT_CONFIDENCE")],
  ["ce2-shadow", file.includes("CE2_EVOLUTION_LIBRARY")],
];
let pass=0; for (const [name, ok] of checks) { console.log(`${ok?"PASS":"FAIL"} ${name}`); if(ok) pass++; }
console.log(`CIE-R1 static ${pass}/${checks.length}`); if(pass!==checks.length) process.exit(1);

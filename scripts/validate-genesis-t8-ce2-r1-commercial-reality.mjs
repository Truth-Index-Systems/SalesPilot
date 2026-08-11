import fs from "node:fs";

const target = "lib/genesis-t8/ce2-evolution/commercial-reality.ts";
if (!fs.existsSync(target)) throw new Error("CE2_R1_COMMERCIAL_REALITY_MISSING");
const source = fs.readFileSync(target, "utf8");
let passed = 0;
const checks = [
  ["version", /GENESIS_T8_CE2_EVOLUTION_R1_VERSION\s*=\s*"1\.0\.0"/],
  ["reality type", /type GenesisT8CommercialReality\s*=/],
  ["identity type", /type GenesisT8CommercialRealityIdentity\s*=/],
  ["objective identity", /commercialObjectiveId:\s*string/],
  ["deterministic id", /function commercialRealityId/],
  ["fingerprint", /function commercialRealityFingerprint/],
  ["lifecycle", /"EMERGING"[\s\S]*"ESTABLISHED"[\s\S]*"CHANGING"[\s\S]*"RESOLVED"/],
  ["reality evaluator", /function evaluateCommercialReality/],
  ["opportunity projection", /function projectOpportunityFromCommercialReality/],
  ["projection law", /COMMERCIAL_REALITY_IS_PRIMARY_OPPORTUNITY_IS_A_PROJECTION/],
  ["frozen consumption law", /FROZEN_UDOSIB_1_0_0_IS_CONSUMED_READ_ONLY/],
  ["no ranking law", /NO_OPPORTUNITY_RANKING_IS_IMPLEMENTED_IN_R1/],
  ["trace", /type GenesisT8CommercialRealityTrace/],
  ["governing constraints", /COMMERCIAL_REALITY_REQUIRES_GOVERNING_CONSTRAINT/],
];
for (const [name, re] of checks) {
  if (!re.test(source)) throw new Error(`CE2_R1_STATIC_FAIL:${name}`);
  passed += 1;
}
for (const forbidden of [
  /from\s+["']openai["']/i,
  /from\s+["']next\//i,
  /from\s+["']@supabase/i,
  /process\.env/,
  /Date\.now\s*\(/,
  /new\s+Date\s*\(/,
  /Math\.random\s*\(/,
]) {
  if (forbidden.test(source)) throw new Error(`CE2_R1_STATIC_FAIL:FORBIDDEN_DEPENDENCY:${forbidden}`);
  passed += 1;
}
console.log(`PASS CE2-R1 Commercial Reality static validator ${passed}/${checks.length + 7}`);

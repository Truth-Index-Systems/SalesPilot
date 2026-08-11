import fs from "node:fs";
const target="lib/genesis-t8/ce2-evolution/multidimensional-stability.ts";
if(!fs.existsSync(target)) throw new Error("CE2_R5_STABILITY_MISSING");
const source=fs.readFileSync(target,"utf8");
let passed=0;
const checks=[
 ["version",/GENESIS_T8_CE2_EVOLUTION_R5_VERSION\s*=\s*"1\.0\.0"/],
 ["six inherited dimensions",/"SEMANTIC"[\s\S]*"STRUCTURAL"[\s\S]*"OPERATIONAL"[\s\S]*"COMMERCIAL"[\s\S]*"TECHNOLOGICAL"[\s\S]*"STRATEGIC"/],
 ["constraint margin",/function restrictiveConstraintMargin/],
 ["boundary margin",/effectiveBoundarySurvivalSupport - state\.effectiveBoundaryEliminationSupport - state\.relevantContradictionUncertainty/],
 ["limiting margin",/1 - state\.effectiveLimitingPressure - state\.relevantContradictionUncertainty/],
 ["global floor",/globalStabilityFloor/],
 ["lex profile",/lexicographicProfile/],
 ["critical dimensions",/criticalDimensions/],
 ["lex comparator",/function compareStabilityLexicographically/],
 ["no support resilience",/SUPPORTING[\s\S]*return null/],
 ["viability deferred",/VIABILITY_KERNEL_DYNAMICS_ARE_DEFERRED/],
 ["no ranking",/CE2_R5_DOES_NOT_RANK_OPPORTUNITIES_ROUTES_CONTACTS_OR_RESEARCH/],
];
for(const [name,re] of checks){if(!re.test(source))throw new Error(`CE2_R5_STATIC_FAIL:${name}`);passed++;}
for(const forbidden of [/from\s+["']openai["']/i,/from\s+["']next\//i,/from\s+["']@supabase/i,/process\.env/,/Date\.now\s*\(/,/Math\.random\s*\(/,/\bweight\s*:/i,/\bprobability\s*:/i]){if(forbidden.test(source))throw new Error(`CE2_R5_STATIC_FAIL:FORBIDDEN:${forbidden}`);passed++;}
console.log(`PASS CE2-R5 Multidimensional Stability static validator ${passed}/${checks.length+8}`);

import fs from "node:fs";
const ai=fs.readFileSync("lib/genesis-g8/autonomous-expansion-openai.ts","utf8");
const checks=[
 ["three-company ceiling",ai.includes("GENESIS_G82_EXPANSION_COMPANIES_PER_CALL = 3")],
 ["three-company primary prompt",ai.includes("Return up to three distinct companies in this single call")],
 ["three-company recovery prompt",ai.includes("Return up to three distinct companies when verifiable companies exist")],
 ["original reservation restored",ai.includes('MARKETROUTE_G82_EXPANSION_ESTIMATED_COST_USD??"0.08")||0.08')],
 ["original output floor restored",ai.includes("max_output_tokens:Math.max(profile.maxOutputTokens,6000)")],
 ["breadth recovery retained",ai.includes("breadth-recovery")&&ai.includes("GENESIS_G82_EXPANSION_EMPTY_AFTER_RECOVERY")],
 ["rotating search angle retained",ai.includes("searchAngles")&&ai.includes("attemptNumber%searchAngles.length")],
];
let ok=0; for(const [name,pass] of checks){if(!pass){console.error(`FAIL ${name}`);process.exitCode=1}else{console.log(`PASS ${name}`);ok++}}
console.log(`${ok}/${checks.length} G8.2 R5 checks passed`);

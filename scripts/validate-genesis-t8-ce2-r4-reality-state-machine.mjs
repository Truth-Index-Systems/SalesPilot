import fs from "node:fs";
const target="lib/genesis-t8/ce2-evolution/reality-state-machine.ts";
if(!fs.existsSync(target)) throw new Error("CE2_R4_REALITY_STATE_MACHINE_MISSING");
const source=fs.readFileSync(target,"utf8");
let passed=0;
const checks=[
 ["version",/GENESIS_T8_CE2_EVOLUTION_R4_VERSION\s*=\s*"1\.0\.0"/],
 ["states",/"IMPOSSIBLE"[\s\S]*"DORMANT"[\s\S]*"EXPIRED"[\s\S]*"UNRESOLVED"[\s\S]*"CONTESTED"[\s\S]*"POSSIBLE"[\s\S]*"ESTABLISHED"/],
 ["critical knowledge",/decisionCriticalKnowledgeIds/],
 ["evaluate",/function evaluateRealityDecisionState/],
 ["transition",/function deriveRealityDecisionTransition/],
 ["time pressure",/WITHIN_DECISION_HORIZON/],
 ["commercial precedence",/commercial\.viability === "ELIMINATED"/],
 ["expired precedence",/temporal\.state === "EXPIRED"/],
 ["dormant",/temporal\.state === "NOT_YET_ACTIVE"/],
 ["contested",/contradictoryKnowledgeIds\.length > 0/],
 ["possible",/uncertainKnowledgeIds\.length > 0/],
 ["identity transition",/REALITY_IDENTITY_CHANGED_ACROSS_TRANSITION/],
 ["enrichment law",/OPTIONAL_ENRICHMENT_KNOWLEDGE_CANNOT_DOWNGRADE_AN_ESTABLISHED_REALITY/],
 ["no ranking law",/CE2_R4_DOES_NOT_RANK_OPPORTUNITIES_ROUTES_CONTACTS_OR_RESEARCH/],
];
for(const [name,re] of checks){if(!re.test(source))throw new Error(`CE2_R4_STATIC_FAIL:${name}`);passed++;}
for(const forbidden of [/from\s+["']openai["']/i,/from\s+["']next\//i,/from\s+["']@supabase/i,/process\.env/,/Date\.now\s*\(/,/Math\.random\s*\(/,/\bscore\s*:/i,/\bweight\s*:/i,/\bprobability\s*:/i]){
 if(forbidden.test(source))throw new Error(`CE2_R4_STATIC_FAIL:FORBIDDEN_DEPENDENCY:${forbidden}`);passed++;
}
console.log(`PASS CE2-R4 Reality State Machine static validator ${passed}/${checks.length+9}`);

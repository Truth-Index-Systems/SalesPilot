import fs from "node:fs";
const target="lib/genesis-t8/ce2-evolution/temporal-mathematics.ts";
if(!fs.existsSync(target)) throw new Error("CE2_R3_TEMPORAL_MATHEMATICS_MISSING");
const source=fs.readFileSync(target,"utf8");
let passed=0;
const checks=[
 ["version",/GENESIS_T8_CE2_EVOLUTION_R3_VERSION\s*=\s*"1\.0\.0"/],
 ["states",/"NOT_YET_ACTIVE"[\s\S]*"ACTIVE"[\s\S]*"EXPIRING"[\s\S]*"EXPIRED"[\s\S]*"TIME_UNBOUNDED"/],
 ["interval",/type GenesisT8TemporalInterval\s*=/],
 ["policy",/type GenesisT8TemporalPolicy\s*=/],
 ["explicit horizon",/decisionHorizonMs\?: number \| null/],
 ["assessment",/function evaluateTemporalState/],
 ["reality qualification",/function qualifyCommercialRealityTemporally/],
 ["relation",/function temporalIntervalRelation/],
 ["rfc3339",/RFC3339/],
 ["epistemic mapping",/epistemicTemporalValidity/],
 ["elapsed",/elapsedSinceActivationMs/],
 ["until activation",/remainingUntilActivationMs/],
 ["until expiry",/remainingUntilExpiryMs/],
 ["no decay law",/NO_EXPONENTIAL_LINEAR_OR_HIDDEN_DECAY_FUNCTION_IS_PERMITTED/],
 ["no default horizon law",/NO_DEFAULT_DECISION_HORIZON_IS_INVENTED_BY_CE2_R3/],
 ["truth law",/TEMPORAL_MATHEMATICS_NEVER_CHANGES_TRUTH_INDEX_PROBABILITY_OR_CONFIDENCE/],
 ["unbounded law",/TIME_UNBOUNDED_IS_NOT_EQUIVALENT_TO_CURRENT_VERIFIED_FRESHNESS/],
 ["no ranking law",/CE2_R3_DOES_NOT_RANK_OPPORTUNITIES_ROUTES_CONTACTS_OR_RESEARCH/],
];
for(const [name,re] of checks){if(!re.test(source))throw new Error(`CE2_R3_STATIC_FAIL:${name}`);passed++;}
for(const forbidden of [/from\s+["']openai["']/i,/from\s+["']next\//i,/from\s+["']@supabase/i,/process\.env/,/Date\.now\s*\(/,/Math\.random\s*\(/,/Math\.exp\s*\(/,/freshnessHalfLife/i,/defaultDecisionHorizon/i]){
 if(forbidden.test(source))throw new Error(`CE2_R3_STATIC_FAIL:FORBIDDEN_DEPENDENCY:${forbidden}`);passed++;
}
console.log(`PASS CE2-R3 Temporal Mathematics static validator ${passed}/${checks.length+9}`);

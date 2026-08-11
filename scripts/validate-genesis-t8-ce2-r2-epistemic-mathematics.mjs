import fs from "node:fs";
const target="lib/genesis-t8/ce2-evolution/epistemic-mathematics.ts";
if(!fs.existsSync(target)) throw new Error("CE2_R2_EPISTEMIC_MATHEMATICS_MISSING");
const source=fs.readFileSync(target,"utf8");
let passed=0;
const checks=[
 ["version",/GENESIS_T8_CE2_EVOLUTION_R2_VERSION\s*=\s*"1\.0\.0"/],
 ["seven states",/"KNOWN"[\s\S]*"UNCERTAIN"[\s\S]*"UNKNOWN"[\s\S]*"UNVERIFIED"[\s\S]*"CONTRADICTORY"[\s\S]*"EXPIRED"[\s\S]*"MISSING"/],
 ["vector",/type GenesisT8EpistemicVector\s*=/],
 ["presence axis",/presence:\s*GenesisT8EpistemicPresence/],
 ["verification axis",/verification:\s*GenesisT8EpistemicVerification/],
 ["resolution axis",/resolution:\s*GenesisT8EpistemicResolution/],
 ["contradiction axis",/contradiction:\s*GenesisT8EpistemicContradiction/],
 ["temporal axis",/temporalValidity:\s*GenesisT8EpistemicTemporalValidity/],
 ["primary derivation",/function deriveEpistemicPrimaryState/],
 ["permission",/function commercialPermissionForEpistemicState/],
 ["research disposition",/function researchDispositionForEpistemicState/],
 ["profile",/function buildEpistemicProfile/],
 ["reality qualification",/function qualifyCommercialRealityEpistemically/],
 ["orthogonal law",/EPISTEMIC_STATE_IS_ORTHOGONAL_TO_COMMERCIAL_CONSTRAINT_ROLE/],
 ["truth ownership",/TI_REMAINS_SOLE_OWNER_OF_TRUTH_PROBABILITY_CONFIDENCE_CONTRADICTION_AND_FRESHNESS/],
 ["no decay",/CE2_R2_DOES_NOT_INVENT_PROBABILITY_THRESHOLDS_OR_DECAY_FUNCTIONS/],
 ["time deferred",/TIME_CALCULATION_IS_DEFERRED/],
 ["zero force law",/UNKNOWN_UNVERIFIED_EXPIRED_AND_MISSING_KNOWLEDGE_SUPPLY_ZERO_DIRECTIONAL_COMMERCIAL_FORCE/],
];
for(const [name,re] of checks){if(!re.test(source))throw new Error(`CE2_R2_STATIC_FAIL:${name}`);passed++;}
for(const forbidden of [/from\s+["']openai["']/i,/from\s+["']next\//i,/from\s+["']@supabase/i,/process\.env/,/Date\.now\s*\(/,/new\s+Date\s*\(/,/Math\.random\s*\(/,/freshnessHalfLifeDays\s*[*\/+-]/]){
 if(forbidden.test(source))throw new Error(`CE2_R2_STATIC_FAIL:FORBIDDEN_DEPENDENCY:${forbidden}`);passed++;
}
console.log(`PASS CE2-R2 Epistemic Mathematics static validator ${passed}/${checks.length+8}`);

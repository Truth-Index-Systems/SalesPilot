import fs from 'node:fs';
const src=fs.readFileSync('lib/genesis-t8/cie/truth-ce2-bridge.ts','utf8');
let pass=0; const need=(s)=>{if(!src.includes(s))throw new Error(`missing:${s}`);pass++;};
[
  'composeTruthIntoCommercialReality','CIE_R3_AUTHORITY_MODE = "SHADOW"','truthQualification',
  'contradictionQualified','NOT_YET_ACTIVE','UNASSESSED','evaluateCieTruthNext','buildEpistemicProfile',
  'evaluateTemporalState','evaluateCommercialReality','evaluateRealityDecisionState','NO_NUMERIC_TRUTH_THRESHOLD_IS_INVENTED_BY_THE_BRIDGE',
  'SHADOW_OUTPUT_CANNOT_CONTROL_LIVE_BEHAVIOUR'
].forEach(need);
const frozen=fs.readFileSync('lib/genesis-g8/truth-v2/claims/probability.ts','utf8');
if(!frozen.includes('calculateMrTi2RawClaimProbability'))throw new Error('frozen TI unexpectedly changed'); pass++;
console.log(`CIE-R3 static: ${pass}/14 PASS`);

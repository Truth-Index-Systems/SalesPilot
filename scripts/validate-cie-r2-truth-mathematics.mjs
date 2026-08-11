import fs from 'node:fs';
const src=fs.readFileSync('lib/genesis-t8/cie/truth-next.ts','utf8'); let pass=0; const need=(s)=>{if(!src.includes(s))throw new Error(`missing:${s}`);pass++};
['aggregateDependenceFamilies','compoundIndependentFamilyStrengths','rawEvidenceBalance','truthProbability','UNCALIBRATED','EMPIRICALLY_CALIBRATED','PAV_ISOTONIC','fitCieTruthCalibrationProfile','SHADOW','supportStrength','contradictionStrength'].forEach(need);
const frozen=fs.readFileSync('lib/genesis-g8/truth-v2/claims/probability.ts','utf8'); if(!frozen.includes('calculateMrTi2RawClaimProbability'))throw new Error('frozen TI unexpectedly changed'); pass++;
console.log(`CIE-R2 static: ${pass}/12 PASS`);

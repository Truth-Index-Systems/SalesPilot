import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const checks=[];
const check=(name,condition)=>{checks.push([name,!!condition]);if(!condition)console.error('FAIL:',name);};
const freshness=read('lib/genesis-g8/truth-v2/evidence/freshness.ts');
const production=read('lib/genesis-g8/truth-v2/production-hydration.ts');
const matrix=read('lib/genesis-g8/truth-v2/matrix-one/aggregate.ts');
const claim=read('lib/genesis-g8/truth-v2/claims/evaluate.ts');
const entity=read('lib/genesis-g8/truth-v2/entity/aggregate.ts');
const cie=read('lib/genesis-t8/cie/truth-next.ts');
const migration=read('supabase/migrations/0151_marketroute_forensic_build1_truth_foundation.sql');
check('freshness has explicit reference time',freshness.includes('referenceTime')&&freshness.includes('reference.getTime()-origin.getTime()'));
check('undated evidence falls back to observedAt',freshness.includes('OBSERVED_AT_FALLBACK')&&freshness.includes('origin=observed'));
check('production passes one reference time into evidence primitives',production.includes('referenceTime,')&&production.includes('calculatedAt:referenceTime'));
check('production resolves dependence families',production.includes('resolveDependenceFamilyKey')&&matrix.includes('representativeStrength'));
check('claim state emits uncalibrated probability explicitly',claim.includes('truthProbability')&&claim.includes('UNCALIBRATED'));
check('entity exposes independent evidence sufficiency',entity.includes('weightedEvidenceSufficiencyMass')&&entity.includes('evidenceSufficiency'));
check('CIE consumes shared Truth Foundation',cie.includes('../../truth-foundation/epistemic')&&cie.includes('SHARED_FOUNDATION'));
check('duplicate shadow authority removed',!cie.includes('0.1.0-shadow')&&!cie.includes('AUTHORITY_MODE = "SHADOW"'));
check('SQL probability helper refuses uncalibrated evidence',migration.includes("probabilityState'='EMPIRICALLY_CALIBRATED")&&migration.includes('mrti2_result_claim_evidence_balance'));
const forbidden=[
  'calculateMrTi2RawClaimProbability','rawProbability','preDependencyProbability','parentProbability','conflictingProbability'
];
const truthFiles=['lib/genesis-g8/truth-v2/claims/evaluate.ts','lib/genesis-g8/truth-v2/matrix-two/evaluate.ts','lib/genesis-g8/truth-v2/matrix-two/dependency.ts','lib/genesis-g8/truth-v2/matrix-two/contradiction.ts'];
for(const token of forbidden) check(`legacy probability symbol absent: ${token}`,truthFiles.every((file)=>!read(file).includes(token)));
const failed=checks.filter(([,ok])=>!ok);
console.log(`Forensic Build 1 static authority checks: ${checks.length-failed.length}/${checks.length} passed`);
if(failed.length) process.exit(1);

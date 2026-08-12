import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const runtimeRoot=process.argv[2];
if(!runtimeRoot) throw new Error('FORENSIC_BUILD1_RUNTIME_ROOT_REQUIRED');
const require=createRequire(import.meta.url);
const load=(relative)=>require(path.resolve(runtimeRoot,relative));

const epistemic=load('lib/truth-foundation/epistemic.js');
const freshness=load('lib/genesis-g8/truth-v2/evidence/freshness.js');
const strength=load('lib/genesis-g8/truth-v2/evidence/strength.js');
const matrix1=load('lib/genesis-g8/truth-v2/matrix-one/aggregate.js');
const claims=load('lib/genesis-g8/truth-v2/claims/index.js');
const matrix2=load('lib/genesis-g8/truth-v2/matrix-two/evaluate.js');
const entity=load('lib/genesis-g8/truth-v2/entity/aggregate.js');
const cie=load('lib/genesis-t8/cie/truth-next.js');

const checks=[];
const check=(name,fn)=>{
  try{fn();checks.push([name,true]);}
  catch(error){checks.push([name,false]);console.error('FAIL:',name,'\n ',error instanceof Error?error.message:error);}
};
const approx=(a,b,t=1e-9)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`);
const primitive=(overrides={})=>({
  authority:.8,directness:.8,traceability:.8,
  sourcePublishedAt:'2026-01-01T00:00:00.000Z',observedAt:'2026-01-01T00:00:00.000Z',referenceTime:'2026-01-01T00:00:00.000Z',
  freshnessHalfLifeDays:30,derivativeDepth:0,...overrides,
});

check('known-date freshness decays against reference time',()=>{
  const day0=strength.calculateMrTi2EvidenceStrength(primitive());
  const day30=strength.calculateMrTi2EvidenceStrength(primitive({referenceTime:'2026-01-31T00:00:00.000Z'}));
  const day60=strength.calculateMrTi2EvidenceStrength(primitive({referenceTime:'2026-03-02T00:00:00.000Z'}));
  approx(day0.freshnessModifier,1);
  approx(day30.freshnessModifier,.5,1e-12);
  approx(day60.freshnessModifier,.25,1e-12);
  assert.ok(day0.effectiveStrength>day30.effectiveStrength&&day30.effectiveStrength>day60.effectiveStrength);
});

check('undated evidence decays from observation instead of remaining permanently fresh',()=>{
  const day0=strength.calculateMrTi2EvidenceStrength(primitive({sourcePublishedAt:null}));
  const day30=strength.calculateMrTi2EvidenceStrength(primitive({sourcePublishedAt:null,referenceTime:'2026-01-31T00:00:00.000Z'}));
  assert.equal(day0.freshnessBasis,'OBSERVED_AT_FALLBACK');
  assert.equal(day0.sourcePublicationKnown,false);
  approx(day30.freshnessModifier,.5,1e-12);
  assert.ok(day30.effectiveStrength<day0.effectiveStrength);
});

check('future/anomalous publication timestamp cannot make evidence younger than observation',()=>{
  const assessed=freshness.assessMrTi2FreshnessAge('2026-02-01T00:00:00.000Z','2026-01-01T00:00:00.000Z','2026-01-31T00:00:00.000Z');
  assert.equal(assessed.basis,'OBSERVED_AT_FALLBACK');
  assert.equal(assessed.sourcePublicationKnown,false);
  approx(assessed.ageDays,30);
});

check('three copied observations collapse to one dependence-family representative',()=>{
  const cells=matrix1.buildMrTi2MatrixOne(['a','b','c'].map((evidenceKey)=>({evidenceKey,claimKey:'claim',direction:'SUPPORT',dependenceFamilyKey:'same-origin',primitive:primitive()})));
  const aggregate=matrix1.aggregateMrTi2ClaimEvidence('claim',cells);
  assert.equal(aggregate.families.length,1);
  approx(aggregate.supportStrength,.8,1e-12);
});

check('three independent observations may compound',()=>{
  const cells=matrix1.buildMrTi2MatrixOne(['a','b','c'].map((evidenceKey)=>({evidenceKey,claimKey:'claim',direction:'SUPPORT',dependenceFamilyKey:evidenceKey,primitive:primitive()})));
  const aggregate=matrix1.aggregateMrTi2ClaimEvidence('claim',cells);
  assert.equal(aggregate.families.length,3);
  approx(aggregate.supportStrength,.992,1e-12);
});

check('weak positive evidence is evidence balance, never silently a negative/false probability',()=>{
  const aggregate={claimKey:'weak',cells:[],families:[],supportStrength:.2,contradictionStrength:0,evidenceSufficiency:.2,undatedEvidenceCount:0,minimumFreshnessModifier:1};
  const state=claims.evaluateMrTi2RawClaim(aggregate);
  approx(state.evidenceBalance,.2);
  approx(state.evidenceSufficiency,.2);
  assert.equal(state.truthProbability,null);
  assert.equal(state.probabilityState,'UNCALIBRATED');
});

check('balanced conflict increases evidence sufficiency while moving evidence balance to neutral',()=>{
  const balance=epistemic.calculateEvidenceBalance(.8,.8);
  const sufficiency=epistemic.calculateEvidenceSufficiency(.8,.8);
  approx(balance,.5,1e-12);
  approx(sufficiency,.96,1e-12);
  assert.ok(sufficiency>.8);
});

check('empirical calibration is the only path that emits truthProbability',()=>{
  const profile=claims.fitMrTi2CalibrationProfile([
    {rawEvidenceBalance:.1,outcome:0},{rawEvidenceBalance:.2,outcome:0},{rawEvidenceBalance:.4,outcome:0},
    {rawEvidenceBalance:.6,outcome:1},{rawEvidenceBalance:.8,outcome:1},{rawEvidenceBalance:.9,outcome:1},
  ]);
  const aggregate={claimKey:'cal',cells:[],families:[],supportStrength:.8,contradictionStrength:0,evidenceSufficiency:.8,undatedEvidenceCount:0,minimumFreshnessModifier:1};
  const state=claims.evaluateMrTi2RawClaim(aggregate,profile);
  assert.equal(state.probabilityState,'EMPIRICALLY_CALIBRATED');
  assert.notEqual(state.truthProbability,null);
  assert.ok(state.truthProbability>=0&&state.truthProbability<=1);
});

check('matrix two operates on evidenceBalance names and leaves uncalibrated probability null',()=>{
  const mk=(key,s,c)=>claims.evaluateMrTi2RawClaim({claimKey:key,cells:[],families:[],supportStrength:s,contradictionStrength:c,evidenceSufficiency:epistemic.calculateEvidenceSufficiency(s,c),undatedEvidenceCount:0,minimumFreshnessModifier:1});
  const result=matrix2.evaluateMrTi2MatrixTwo({claims:{parent:mk('parent',.4,0),child:mk('child',.9,0)},relationships:[{fromClaimKey:'child',toClaimKey:'parent',relationshipType:'DEPENDS_ON',strength:1}],calibrationProfile:null});
  approx(result.claims.child.evidenceBalance,.4,1e-12);
  assert.equal(result.claims.child.truthProbability,null);
  assert.equal(result.claims.child.dependencyConstraints[0].parentEvidenceBalance,.4);
});

check('entity evidence sufficiency is independent from directional Truth Index',()=>{
  const mk=(key,s,c)=>claims.evaluateMrTi2RawClaim({claimKey:key,cells:[],families:[],supportStrength:s,contradictionStrength:c,evidenceSufficiency:epistemic.calculateEvidenceSufficiency(s,c),undatedEvidenceCount:0,minimumFreshnessModifier:1});
  const adjusted=matrix2.evaluateMrTi2MatrixTwo({claims:{a:mk('a',.8,0),b:mk('b',.8,.8)},relationships:[],calibrationProfile:null});
  const result=entity.aggregateMrTi2EntityTruth({entityType:'company',claims:adjusted.claims,definitions:[
    {key:'a',label:'A',proposition:'A',impactClass:'SUPPORTING',weight:1,freshnessHalfLifeDays:30,countsTowardCoverage:true,allowedRelationshipTypes:[]},
    {key:'b',label:'B',proposition:'B',impactClass:'SUPPORTING',weight:1,freshnessHalfLifeDays:30,countsTowardCoverage:true,allowedRelationshipTypes:[]},
  ],calculatedAt:'2026-01-01T00:00:00.000Z'});
  approx(result.state.truthIndex,65,1e-9);
  approx(result.state.evidenceSufficiency,88,1e-9);
  approx(result.state.representedConfidence,88,1e-9);
  assert.equal(result.state.probabilityState,'UNCALIBRATED');
  approx(result.state.calibratedProbabilityCoverage,0);
  assert.equal(result.truthSemanticsVersion,'MR-TI-2-TFR1');
});

check('CIE and production Truth share one epistemic primitive',()=>{
  assert.equal(cie.CIE_TRUTH_NEXT_AUTHORITY_MODE,'SHARED_FOUNDATION');
  approx(cie.calculateRawEvidenceBalance(.8,.8),epistemic.calculateEvidenceBalance(.8,.8),1e-12);
  const copied=cie.evaluateCieTruthNext([
    {evidenceKey:'a',direction:'SUPPORT',effectiveStrength:.8,dependenceFamilyKey:'family'},
    {evidenceKey:'b',direction:'SUPPORT',effectiveStrength:.7,dependenceFamilyKey:'family'},
  ]);
  approx(copied.supportStrength,.8,1e-12);
  assert.equal(copied.truthProbability,null);
});

const failed=checks.filter(([,ok])=>!ok);
console.log(`Forensic Build 1 Truth Foundation adversarial invariants: ${checks.length-failed.length}/${checks.length} passed`);
if(failed.length) process.exit(1);

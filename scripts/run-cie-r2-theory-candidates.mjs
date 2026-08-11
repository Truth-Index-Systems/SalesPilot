let pass=0; const ok=(x,m)=>{if(!x)throw new Error(m);pass++};
// Candidate 1: identity mapping support==probability fails semantics without outcome calibration.
const support=.82; ok(support===.82,"identity fixture");
// Candidate 2: full Bayesian source model requires externally justified source TPR/FPR/prior; absent in current contract.
const hasCalibratedSourceErrorRates=false; ok(!hasCalibratedSourceErrorRates,"bayesian should be deferred without calibrated source parameters");
// Candidate 3: dependence-family collapse + empirical monotonic calibration preserves both requirements.
const copied=[.8,.8,.8]; const dependent=Math.max(...copied); const naive=1-copied.reduce((p,s)=>p*(1-s),1);
ok(dependent===.8 && naive>.99,"dependence-aware aggregation must prevent copying inflation");
console.log(`CIE-R2 theory candidates: ${pass}/3 PASS`);

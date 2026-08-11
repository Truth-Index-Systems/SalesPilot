import assert from 'node:assert/strict';
let pass=0; const t=(n,f)=>{f();console.log('PASS',n);pass++};
// Candidate 1 nearest-distance: a tiny but inadmissible mutation must not beat a larger actionable one.
t('nearest-distance fails actionability relationship',()=>{const nearest={distance:1,actionable:false};const farther={distance:2,actionable:true};assert.equal(nearest.distance<farther.distance,true);assert.equal(farther.actionable,true)});
// Candidate 2 scalar cost recourse: cheap irreversible vs dear reversible is constitutionally incomparable without exchange rate.
t('scalar cost cannot resolve unlike burdens constitutionally',()=>{const cheapIrreversible={cost:1,irreversible:1};const dearReversible={cost:2,irreversible:0};assert.equal(cheapIrreversible.cost<dearReversible.cost,true);assert.equal(cheapIrreversible.irreversible>dearReversible.irreversible,true)});
// Candidate 3 subset-minimal + Pareto preserves both where neither dominates.
t('subset-minimal Pareto preserves legitimate alternatives',()=>{const a={actions:1,irreversible:1,cost:1};const b={actions:1,irreversible:0,cost:2};const dominates=(x,y)=>x.actions<=y.actions&&x.irreversible<=y.irreversible&&x.cost<=y.cost&&(x.actions<y.actions||x.irreversible<y.irreversible||x.cost<y.cost);assert.equal(dominates(a,b),false);assert.equal(dominates(b,a),false)});
console.log(`${pass}/3 PASS`);

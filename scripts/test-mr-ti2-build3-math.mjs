import assert from 'node:assert/strict';

const CAP=.999, BETA=.5, BASE=3;
const quality=(xs)=>{
  const mean=xs.reduce((a,b)=>a+b,0)/xs.length;
  const sd=Math.sqrt(xs.reduce((s,x)=>s+(x-mean)**2,0)/xs.length);
  return {mean,sd,q:Math.min(CAP,Math.max(0,mean-BETA*sd))};
};
const fresh=(age,half)=>2**(-age/half);
const independent=(depth)=>BASE**(-depth);
const strength=(xs,age,half,depth)=>Math.min(CAP,quality(xs).q*fresh(age,half)*independent(depth));
const close=(actual,expected,tol=1e-9)=>assert.ok(Math.abs(actual-expected)<=tol,`${actual} != ${expected}`);

// Balanced strong evidence stays strong; SD is zero.
let r=quality([.9,.9,.9]); close(r.mean,.9); close(r.sd,0); close(r.q,.9);
// Same-ish mean but lopsided evidence is penalised.
r=quality([.99,.99,.72]); assert.ok(r.q < .90 && r.q > .82);
// Monotonic quality: uniformly improving dimensions must improve Q.
assert.ok(quality([.9,.9,.9]).q > quality([.8,.8,.8]).q);
// Freshness half-life contract.
close(fresh(0,30),1); close(fresh(30,30),.5); close(fresh(60,30),.25); close(fresh(90,30),.125);
// Claim-specific half lives differ for same age.
assert.ok(fresh(30,365) > fresh(30,45));
// Lineage exponential decay exactly 3^-r.
close(independent(0),1); close(independent(1),1/3); close(independent(2),1/9); close(independent(3),1/27);
// Effective evidence cannot exceed cap and each modifier can only reduce it.
assert.ok(strength([1,1,1],0,30,0)<=CAP);
const root=strength([.9,.9,.9],0,30,0);
const derivative=strength([.9,.9,.9],0,30,1);
close(root,.9); close(derivative,.3);
assert.ok(strength([.9,.9,.9],30,30,0) < root);
assert.ok(derivative < root);
// Root observation with no decay is not accidentally crushed by old five-way multiplication.
assert.ok(root > .85);
// Stress: deep derivatives approach zero without becoming negative/non-finite.
for(let d=0;d<=20;d++){
  const i=independent(d); assert.ok(Number.isFinite(i) && i>=0 && i<=1);
}
console.log('MR-TI-2 Build 3 mathematical tests: PASS (16 invariants)');

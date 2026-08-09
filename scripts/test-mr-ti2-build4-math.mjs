import assert from 'node:assert/strict';

const CAP=.999,FLOOR=.001;
const compound=(xs)=>xs.length===0?0:Math.min(CAP,Math.max(0,1-xs.reduce((p,x)=>p*(1-Math.min(1,Math.max(0,x))),1)));
const probability=(s,c)=>{
  s=Math.min(1,Math.max(0,s)); c=Math.min(1,Math.max(0,c));
  if(s===0&&c===0) return null;
  let p;
  if(c===0) p=s;
  else if(s===0) p=1-c;
  else { const n=s*(1-c), d=n+c*(1-s); p=d===0?.5:n/d; }
  return Math.min(CAP,Math.max(FLOOR,p));
};
const gate=(s,c)=>{
  const k=s*c,b=Math.min(s,c);
  if(k>=.64&&b>=.70)return 'HUMAN_REVIEW_REQUIRED';
  if(k>=.36&&b>=.50)return 'VERIFY';
  return 'AUTO';
};
const close=(a,b,t=1e-9)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`);

// Matrix 1 noisy-OR compounding.
close(compound([]),0);
close(compound([.7,.8,.9]),.994);
close(compound([.9]),.9);
assert.ok(compound([.9,.9])>.9);
assert.ok(compound([.9,.9,.9])<=CAP);
assert.ok(compound([.3,.3,.3])>compound([.3,.3]));
// No support and no contradiction means unknown, never false.
assert.equal(probability(0,0),null);
// One-sided evidence maps directly to belief/disbelief.
close(probability(.3,0),.3);
close(probability(.9,0),.9);
close(probability(0,.8),.2);
// Equal bilateral evidence resolves to 0.5.
close(probability(.9,.9),.5);
close(probability(.8,.8),.5);
// Strong support beats weak contradiction; inverse case becomes unlikely.
assert.ok(probability(.95,.2)>.98);
assert.ok(probability(.2,.95)<.02);
// Previously tested core collision lands around 69.2%.
close(probability(.9,.8),.6923076923076924);
// Probability is capped and floored only for represented claims.
close(probability(1,0),CAP);
close(probability(0,1),FLOOR);
// Contradiction gate zones.
assert.equal(gate(.95,.2),'AUTO');
assert.equal(gate(.9,.4),'AUTO');
assert.equal(gate(.6,.6),'VERIFY');
assert.equal(gate(.7,.7),'VERIFY');
assert.equal(gate(.95,.6),'VERIFY');
assert.equal(gate(.8,.8),'HUMAN_REVIEW_REQUIRED');
assert.equal(gate(.95,.75),'HUMAN_REVIEW_REQUIRED');
assert.equal(gate(.95,.95),'HUMAN_REVIEW_REQUIRED');
// High one-sided contradiction is not ambiguity/human review by itself.
assert.equal(gate(.05,.95),'AUTO');
// Monotonicity: increasing support with fixed contradiction increases P.
assert.ok(probability(.8,.3)>probability(.6,.3));
// Increasing contradiction with fixed support lowers P.
assert.ok(probability(.8,.5)<probability(.8,.3));
console.log('MR-TI-2 Build 4 mathematical tests: PASS (26 invariants)');

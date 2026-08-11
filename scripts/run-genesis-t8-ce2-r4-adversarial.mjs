import path from "node:path";
import { pathToFileURL } from "node:url";
const dir=process.argv[2]; if(!dir) throw new Error("CE2_R4_RUNTIME_DIR_REQUIRED");
const sm=await import(pathToFileURL(path.join(dir,"reality-state-machine.js")).href);
const cr=await import(pathToFileURL(path.join(dir,"commercial-reality.js")).href);
const ep=await import(pathToFileURL(path.join(dir,"epistemic-mathematics.js")).href);
const tm=await import(pathToFileURL(path.join(dir,"temporal-mathematics.js")).href);
let passed=0; const tests=[]; const test=(n,f)=>tests.push([n,f]);
const expectThrow=(fn,token)=>{try{fn();}catch(e){if(String(e?.message??e).includes(token))return;throw e;}throw new Error(`EXPECTED_THROW:${token}`);};
const t=(d)=>`2026-08-${String(d).padStart(2,"0")}T12:00:00Z`;
const commercial=(viability="SURVIVES")=>Object.freeze({
 viability, commercialCoherence:viability==="SURVIVES"?0.8:0, constraintPressure:0.2, commercialStability:viability==="SURVIVES"?0.7:0,
 knowledgeSufficiency:0.9, knowledgeChannels:Object.freeze({viability:0.9,stability:0.9,enrichment:0.5}), reasoningConfidence:0.9,
 dimensions:Object.freeze([]), nearestFailureBoundaryConstraintIds:Object.freeze([]),
});
const reality=(viability="SURVIVES")=>cr.evaluateCommercialReality({identity:{sellerEntityId:"seller",offeringEntityId:"offer",targetEntityId:"target",commercialObjectiveId:"objective"},commercial:commercial(viability),governingConstraintIds:["c1"]});
const vectors={
 known:{presence:"PRESENT",verification:"VERIFIED",resolution:"KNOWN",contradiction:"CONSISTENT",temporalValidity:"CURRENT"},
 uncertain:{presence:"PRESENT",verification:"VERIFIED",resolution:"UNCERTAIN",contradiction:"CONSISTENT",temporalValidity:"CURRENT"},
 unknown:{presence:"PRESENT",verification:"VERIFIED",resolution:"UNKNOWN",contradiction:"CONSISTENT",temporalValidity:"CURRENT"},
 unverified:{presence:"PRESENT",verification:"UNVERIFIED",resolution:"UNKNOWN",contradiction:"CONSISTENT",temporalValidity:"CURRENT"},
 contradiction:{presence:"PRESENT",verification:"VERIFIED",resolution:"UNCERTAIN",contradiction:"CONTRADICTORY",temporalValidity:"CURRENT"},
 expiredContradiction:{presence:"PRESENT",verification:"VERIFIED",resolution:"UNCERTAIN",contradiction:"CONTRADICTORY",temporalValidity:"EXPIRED"},
 missing:{presence:"MISSING",verification:"NOT_APPLICABLE",resolution:"NOT_APPLICABLE",contradiction:"NOT_APPLICABLE",temporalValidity:"NOT_APPLICABLE"},
};
const profile=(pairs)=>ep.buildEpistemicProfile(pairs.map(([knowledgeId,vector])=>({knowledgeId,vector})));
const temporal=(r,state="active")=>tm.evaluateTemporalState({subjectId:r.realityId,interval:state==="future"?{validFrom:t(12),validTo:t(20)}:state==="expired"?{validFrom:t(1),validTo:t(10)}:state==="expiring"?{validFrom:t(1),validTo:t(12)}:{validFrom:t(1),validTo:t(20)},referenceTime:t(11),policy:state==="expiring"?{decisionHorizonMs:86400000}:undefined});
const assess=(r,p,temp,critical=[])=>sm.evaluateRealityDecisionState({reality:r,epistemic:p,temporal:temp,decisionCriticalKnowledgeIds:critical});

test("eliminated reality is impossible",()=>{const r=reality("ELIMINATED"),a=assess(r,profile([]),temporal(r));if(a.state!=="IMPOSSIBLE"||a.reason!=="COMMERCIAL_REALITY_ELIMINATED")throw new Error("IMPOSSIBLE");});
test("future reality is dormant",()=>{const r=reality(),a=assess(r,profile([]),temporal(r,"future"));if(a.state!=="DORMANT")throw new Error("DORMANT");});
test("expired reality is expired",()=>{const r=reality(),a=assess(r,profile([]),temporal(r,"expired"));if(a.state!=="EXPIRED")throw new Error("EXPIRED");});
test("commercial unresolved precedes knowledge",()=>{const r=reality("UNRESOLVED"),p=profile([["k",vectors.known]]),a=assess(r,p,temporal(r),["k"]);if(a.state!=="UNRESOLVED"||a.reason!=="COMMERCIAL_VIABILITY_UNRESOLVED")throw new Error("COMMERCIAL_UNRESOLVED");});
test("critical contradiction is contested",()=>{const r=reality(),p=profile([["k",vectors.contradiction]]),a=assess(r,p,temporal(r),["k"]);if(a.state!=="CONTESTED"||a.contradictoryKnowledgeIds[0]!=="k")throw new Error("CONTESTED");});
test("expired contradiction blocks but does not contest",()=>{const r=reality(),p=profile([["k",vectors.expiredContradiction]]),a=assess(r,p,temporal(r),["k"]);if(a.state!=="UNRESOLVED"||a.contradictoryKnowledgeIds.length!==0||a.blockingKnowledgeIds[0]!=="k")throw new Error("EXPIRED_CONTRADICTION");});
test("critical unknown is unresolved",()=>{const r=reality(),p=profile([["k",vectors.unknown]]),a=assess(r,p,temporal(r),["k"]);if(a.state!=="UNRESOLVED")throw new Error("UNKNOWN");});
test("critical unverified is unresolved",()=>{const r=reality(),p=profile([["k",vectors.unverified]]),a=assess(r,p,temporal(r),["k"]);if(a.state!=="UNRESOLVED")throw new Error("UNVERIFIED");});
test("critical missing is unresolved",()=>{const r=reality(),p=profile([["k",vectors.missing]]),a=assess(r,p,temporal(r),["k"]);if(a.state!=="UNRESOLVED")throw new Error("MISSING");});
test("critical uncertainty is possible",()=>{const r=reality(),p=profile([["k",vectors.uncertain]]),a=assess(r,p,temporal(r),["k"]);if(a.state!=="POSSIBLE"||a.uncertainKnowledgeIds[0]!=="k")throw new Error("POSSIBLE");});
test("critical known is established",()=>{const r=reality(),p=profile([["k",vectors.known]]),a=assess(r,p,temporal(r),["k"]);if(a.state!=="ESTABLISHED"||a.establishedKnowledgeIds[0]!=="k")throw new Error("ESTABLISHED");});
test("zero critical knowledge can be established",()=>{const r=reality(),a=assess(r,profile([]),temporal(r),[]);if(a.state!=="ESTABLISHED")throw new Error("ZERO_CRITICAL");});
test("optional unknown enrichment cannot downgrade",()=>{const r=reality(),p=profile([["optional",vectors.unknown],["critical",vectors.known]]),a=assess(r,p,temporal(r),["critical"]);if(a.state!=="ESTABLISHED"||a.blockingKnowledgeIds.length!==0)throw new Error("OPTIONAL_DOWNGRADE");});
test("expiring is orthogonal pressure",()=>{const r=reality(),p=profile([["k",vectors.known]]),a=assess(r,p,temporal(r,"expiring"),["k"]);if(a.state!=="ESTABLISHED"||a.timePressure!=="WITHIN_DECISION_HORIZON")throw new Error("TIME_PRESSURE");});
test("uncertain expiring remains possible with pressure",()=>{const r=reality(),p=profile([["k",vectors.uncertain]]),a=assess(r,p,temporal(r,"expiring"),["k"]);if(a.state!=="POSSIBLE"||a.timePressure!=="WITHIN_DECISION_HORIZON")throw new Error("POSSIBLE_PRESSURE");});
test("critical ids canonicalised",()=>{const r=reality(),p=profile([["b",vectors.known],["a",vectors.known]]),a=assess(r,p,temporal(r),["b","a"]);if(a.decisionCriticalKnowledgeIds.join(",")!=="a,b")throw new Error("CANONICAL");});
test("duplicate critical id rejected",()=>{const r=reality(),p=profile([["k",vectors.known]]);expectThrow(()=>assess(r,p,temporal(r),["k","k"]),"DUPLICATE_DECISION_CRITICAL_KNOWLEDGE_ID");});
test("unknown critical id rejected",()=>{const r=reality();expectThrow(()=>assess(r,profile([]),temporal(r),["ghost"]),"CRITICAL_KNOWLEDGE_NOT_IN_PROFILE");});
test("temporal subject mismatch rejected",()=>{const r=reality(),bad=tm.evaluateTemporalState({subjectId:"other",interval:{},referenceTime:t(11)});expectThrow(()=>assess(r,profile([]),bad,[]),"TEMPORAL_REALITY_ID_MISMATCH");});
test("initial transition",()=>{const r=reality(),p=profile([]),i={reality:r,epistemic:p,temporal:temporal(r),decisionCriticalKnowledgeIds:[]},a=sm.evaluateRealityDecisionState(i),tr=sm.deriveRealityDecisionTransition(null,a,null,i);if(tr.fromState!==null||tr.toState!=="ESTABLISHED"||tr.transitionReason!=="INITIAL_ASSESSMENT")throw new Error("INITIAL");});
test("epistemic transition possible to established",()=>{const r=reality(),p1=profile([["k",vectors.uncertain]]),p2=profile([["k",vectors.known]]),i1={reality:r,epistemic:p1,temporal:temporal(r),decisionCriticalKnowledgeIds:["k"]},i2={reality:r,epistemic:p2,temporal:temporal(r),decisionCriticalKnowledgeIds:["k"]},a1=sm.evaluateRealityDecisionState(i1),a2=sm.evaluateRealityDecisionState(i2),tr=sm.deriveRealityDecisionTransition(a1,a2,i1,i2);if(tr.toState!=="ESTABLISHED"||tr.transitionReason!=="EPISTEMIC_STATE_CHANGED"||tr.changedAxes.join()!=="EPISTEMIC")throw new Error("EPI_TRANSITION");});
test("temporal transition dormant to established",()=>{const r=reality(),p=profile([]),i1={reality:r,epistemic:p,temporal:temporal(r,"future"),decisionCriticalKnowledgeIds:[]},i2={reality:r,epistemic:p,temporal:temporal(r),decisionCriticalKnowledgeIds:[]},a1=sm.evaluateRealityDecisionState(i1),a2=sm.evaluateRealityDecisionState(i2),tr=sm.deriveRealityDecisionTransition(a1,a2,i1,i2);if(a1.state!=="DORMANT"||a2.state!=="ESTABLISHED"||tr.transitionReason!=="TEMPORAL_STATE_CHANGED")throw new Error("TEMP_TRANSITION");});
test("no state change is stable",()=>{const r=reality(),p=profile([]),i={reality:r,epistemic:p,temporal:temporal(r),decisionCriticalKnowledgeIds:[]},a=sm.evaluateRealityDecisionState(i),tr=sm.deriveRealityDecisionTransition(a,a,i,i);if(tr.changed||tr.transitionReason!=="NO_DECISION_STATE_CHANGE")throw new Error("STABLE");});
test("partial previous rejected",()=>{const r=reality(),p=profile([]),i={reality:r,epistemic:p,temporal:temporal(r),decisionCriticalKnowledgeIds:[]},a=sm.evaluateRealityDecisionState(i);expectThrow(()=>sm.deriveRealityDecisionTransition(a,a,null,i),"PARTIAL_PREVIOUS_STATE");});
test("deterministic assessment",()=>{const r=reality(),p=profile([["k",vectors.known]]),i={reality:r,epistemic:p,temporal:temporal(r),decisionCriticalKnowledgeIds:["k"]};if(JSON.stringify(sm.evaluateRealityDecisionState(i))!==JSON.stringify(sm.evaluateRealityDecisionState(i)))throw new Error("NONDETERMINISTIC");});

for(const [name,fn] of tests){try{fn();passed++;console.log(`PASS ${name}`);}catch(e){console.error(`FAIL ${name}:`,e);process.exitCode=1;break;}}
if(process.exitCode)process.exit(process.exitCode);
console.log(`PASS CE2-R4 Reality State Machine adversarial suite ${passed}/${tests.length}`);

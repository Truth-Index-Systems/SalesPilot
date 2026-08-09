import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const modPath=process.argv[2]; if(!modPath) throw new Error("compiled module path required");
const m=await import(pathToFileURL(modPath));
let pass=0; const test=(name,fn)=>{fn();pass++;console.log("PASS",name)};
const state=(id,cls,patch={})=>({
  constraintId:id,constraintClass:cls,applicability:"APPLICABLE",semanticPolarity:"SUPPORTS_REALITY",signedTruthSignal:0,
  supportStrength:0,limitingPressure:0,boundaryEliminationSupport:0,boundarySurvivalSupport:0,contradictionUncertainty:0,
  representedKnowledge:1,knowledgeDeficit:0,localState:"NEUTRAL",...patch,
});
const dep=(id,from,to,mode)=>({dependencyId:id,fromConstraintId:from,toConstraintId:to,mode,semanticDependencyKey:`${from}:${mode}:${to}`});
const byId=(result,id)=>result.states.find(s=>s.constraintId===id);

test("disconnected constraints remain local",()=>{const r=m.propagateConstraintStates([state("a","SUPPORTING",{supportStrength:.7}),state("b","SUPPORTING")],[]);assert.equal(byId(r,"b").effectiveSupportStrength,0)});
test("support propagates only through SUPPORTING mode",()=>{const r=m.propagateConstraintStates([state("a","SUPPORTING",{supportStrength:.8}),state("b","SUPPORTING")],[dep("d","a","b","SUPPORTING")]);assert.equal(byId(r,"b").effectiveSupportStrength,.8)});
test("support does not propagate through LIMITING mode",()=>{const r=m.propagateConstraintStates([state("a","SUPPORTING",{supportStrength:.8}),state("b","SUPPORTING")],[dep("d","a","b","LIMITING")]);assert.equal(byId(r,"b").effectiveSupportStrength,0)});
test("limiting pressure propagates through LIMITING mode",()=>{const r=m.propagateConstraintStates([state("a","LIMITING",{limitingPressure:.61}),state("b","LIMITING")],[dep("d","a","b","LIMITING")]);assert.equal(byId(r,"b").effectiveLimitingPressure,.61)});
test("limiting pressure cannot become support",()=>{const r=m.propagateConstraintStates([state("a","LIMITING",{limitingPressure:.61}),state("b","SUPPORTING")],[dep("d","a","b","SUPPORTING")]);assert.equal(byId(r,"b").effectiveSupportStrength,0)});
test("required dependency cascades boundary elimination",()=>{const r=m.propagateConstraintStates([state("a","BOUNDARY",{boundaryEliminationSupport:.9}),state("b","BOUNDARY")],[dep("d","a","b","REQUIRED")]);assert.equal(byId(r,"b").effectiveBoundaryEliminationSupport,.9);assert.equal(r.viability,"ELIMINATED")});
test("required satisfaction cannot rescue a violated downstream boundary",()=>{const r=m.propagateConstraintStates([state("a","BOUNDARY",{boundarySurvivalSupport:.95}),state("b","BOUNDARY",{boundaryEliminationSupport:.7,boundarySurvivalSupport:.1})],[dep("d","a","b","REQUIRED")]);assert.equal(byId(r,"b").effectiveBoundarySurvivalSupport,.1);assert.equal(r.viability,"ELIMINATED")});
test("supporting force cannot override violated boundary",()=>{const r=m.propagateConstraintStates([state("boundary","BOUNDARY",{boundaryEliminationSupport:.7}),state("support","SUPPORTING",{supportStrength:1})],[]);assert.equal(r.viability,"ELIMINATED")});
test("unknown knowledge propagates without viability force",()=>{const r=m.propagateConstraintStates([state("a","UNKNOWN",{knowledgeDeficit:.9,representedKnowledge:.1,localState:"UNRESOLVED"}),state("b","SUPPORTING")],[dep("d","a","b","INFORMATIONAL")]);assert.equal(byId(r,"b").effectiveKnowledgeDeficit,.9);assert.equal(byId(r,"b").effectiveSupportStrength,0);assert.equal(byId(r,"b").effectiveLimitingPressure,0)});
test("irrelevant contradiction has no downstream impact",()=>{const r=m.propagateConstraintStates([state("a","CONTRADICTORY",{contradictionUncertainty:.83,localState:"CONTRADICTED"}),state("b","BOUNDARY",{boundarySurvivalSupport:.5})],[]);assert.equal(byId(r,"b").relevantContradictionUncertainty,0);assert.equal(r.viability,"SURVIVES")});
test("relevant contradiction magnitude remains TI value",()=>{const r=m.propagateConstraintStates([state("a","CONTRADICTORY",{contradictionUncertainty:.83,localState:"CONTRADICTED"}),state("b","BOUNDARY",{boundarySurvivalSupport:.9})],[dep("d","a","b","INFORMATIONAL")]);assert.equal(byId(r,"b").relevantContradictionUncertainty,.83)});
test("contradiction dominating boundary margin makes boundary unresolved",()=>{const r=m.propagateConstraintStates([state("a","CONTRADICTORY",{contradictionUncertainty:.8,localState:"CONTRADICTED"}),state("b","BOUNDARY",{boundarySurvivalSupport:.7,boundaryEliminationSupport:.1})],[dep("d","a","b","INFORMATIONAL")]);assert.equal(r.viability,"UNRESOLVED");assert.deepEqual(r.unresolvedBoundaryConstraintIds,["b"])});
test("smaller contradiction does not erase clear boundary survival",()=>{const r=m.propagateConstraintStates([state("a","CONTRADICTORY",{contradictionUncertainty:.2,localState:"CONTRADICTED"}),state("b","BOUNDARY",{boundarySurvivalSupport:.9,boundaryEliminationSupport:.1})],[dep("d","a","b","INFORMATIONAL")]);assert.equal(r.viability,"SURVIVES")});
test("max lattice prevents duplicate path amplification",()=>{const r=m.propagateConstraintStates([state("a","SUPPORTING",{supportStrength:.6}),state("b","SUPPORTING"),state("c","SUPPORTING")],[dep("d1","a","b","SUPPORTING"),dep("d2","a","c","SUPPORTING"),dep("d3","b","c","SUPPORTING")]);assert.equal(byId(r,"c").effectiveSupportStrength,.6)});
test("required chain preserves boundary force without hop attenuation",()=>{const r=m.propagateConstraintStates([state("a","BOUNDARY",{boundaryEliminationSupport:.72}),state("b","BOUNDARY"),state("c","BOUNDARY")],[dep("d1","a","b","REQUIRED"),dep("d2","b","c","REQUIRED")]);assert.equal(byId(r,"c").effectiveBoundaryEliminationSupport,.72)});
test("dependency ordering is deterministic",()=>{const states=[state("z","SUPPORTING"),state("a","SUPPORTING"),state("m","SUPPORTING")];const r=m.propagateConstraintStates(states,[]);assert.deepEqual(r.orderedConstraintIds,["a","m","z"])});
test("self dependency rejected",()=>assert.throws(()=>m.propagateConstraintStates([state("a","SUPPORTING")],[dep("d","a","a","SUPPORTING")]),/SELF_DEPENDENCY/));
test("missing constraint reference rejected",()=>assert.throws(()=>m.propagateConstraintStates([state("a","SUPPORTING")],[dep("d","a","missing","SUPPORTING")]),/DEPENDENCY_CONSTRAINT_MISSING/));
test("duplicate dependency id rejected",()=>assert.throws(()=>m.propagateConstraintStates([state("a","SUPPORTING"),state("b","SUPPORTING"),state("c","SUPPORTING")],[dep("d","a","b","SUPPORTING"),dep("d","a","c","SUPPORTING")]),/DUPLICATE_DEPENDENCY_ID/));
test("duplicate dependency semantics rejected",()=>assert.throws(()=>m.propagateConstraintStates([state("a","SUPPORTING"),state("b","SUPPORTING")],[dep("d1","a","b","SUPPORTING"),dep("d2","a","b","SUPPORTING")]),/DUPLICATE_DEPENDENCY_SEMANTICS/));
test("dependency cycle rejected",()=>assert.throws(()=>m.propagateConstraintStates([state("a","SUPPORTING"),state("b","SUPPORTING")],[dep("d1","a","b","SUPPORTING"),dep("d2","b","a","SUPPORTING")]),/DEPENDENCY_CYCLE/));
test("numeric semantic weight smuggling rejected",()=>{const d={...dep("d","a","b","SUPPORTING"),weight:.9};assert.throws(()=>m.assertConstraintDependencyInvariant(d),/NUMERIC_SEMANTIC_WEIGHT/)});
test("duplicate constraint ids rejected",()=>assert.throws(()=>m.propagateConstraintStates([state("a","SUPPORTING"),state("a","LIMITING")],[]),/DUPLICATE_CONSTRAINT_ID/));
test("no boundaries means viable reality survives propagation",()=>{const r=m.propagateConstraintStates([state("a","SUPPORTING",{supportStrength:.2})],[]);assert.equal(r.viability,"SURVIVES")});
test("neutral applicable boundary remains unresolved",()=>{const r=m.propagateConstraintStates([state("a","BOUNDARY")],[]);assert.equal(r.viability,"UNRESOLVED")});
console.log(`\nGenesis T8 CE-R2 R3 adversarial runtime: ${pass}/25 passed.`);

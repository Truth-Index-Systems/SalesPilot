import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const modulePath=process.argv[2]; if(!modulePath) throw new Error("compiled module path required");
const m=await import(pathToFileURL(modulePath).href);
let pass=0; const test=(name,fn)=>{try{fn();pass++;console.log("PASS",name)}catch(e){console.error("FAIL",name,e);process.exitCode=1}};

const commercial=(o={})=>({viability:"SURVIVES",commercialCoherence:.8,constraintPressure:.1,commercialStability:.8,knowledgeSufficiency:.8,reasoningConfidence:.8,dimensions:[],nearestFailureBoundaryConstraintIds:[],...o});
const real=(state,o={})=>{
 const viability=state==="NOT_VIABLE"?"ELIMINATED":state==="COMMERCIAL_REALITY_UNRESOLVED"?"UNRESOLVED":"SURVIVES";
 const nonSurvivor=viability!=="SURVIVES"?{commercialCoherence:0,commercialStability:0}:{ };
 return {state,commercial:commercial({...o,...nonSurvivor,viability}),contactState:"APPROPRIATE",routeState:state==="STRANDED"?"BLOCKED":state==="VIABLE_BUT_UNRESOLVED"?"UNKNOWN":"DIRECT",routeTargetMode:state==="ACTIONABLE_WITHOUT_NAMED_CONTACT"?"ORGANISATION":"PERSON",actionable:state==="ACTIONABLE"||state==="ACTIONABLE_WITHOUT_NAMED_CONTACT",reasonCode:state==="NOT_VIABLE"?"COMMERCIAL_ELIMINATION":state==="COMMERCIAL_REALITY_UNRESOLVED"?"COMMERCIAL_UNRESOLVED":state==="STRANDED"?"ROUTE_BLOCKED":state==="VIABLE_BUT_UNRESOLVED"?"CONTACT_OR_ROUTE_UNKNOWN":state==="ACTIONABLE_WITHOUT_NAMED_CONTACT"?"ORGANISATIONAL_OR_INTERMEDIARY_ROUTE_AVAILABLE":"CONTACT_AND_ROUTE_AVAILABLE"};
};
const c=(id,state="ACTIONABLE",o={})=>({opportunityId:id,targetEntityId:`target-${id}`,realisation:real(state,o)});

// Core invariants
test("commercial strength is weakest commercial axis",()=>assert.equal(m.commercialStrength({commercialCoherence:.9,commercialStability:.6,knowledgeSufficiency:.9,reasoningConfidence:.9,constraintHeadroom:.8}),.6));
test("decision assurance is weakest epistemic axis",()=>assert.equal(m.decisionAssurance({commercialCoherence:.9,commercialStability:.9,knowledgeSufficiency:.7,reasoningConfidence:.4,constraintHeadroom:.9}),.4));
test("opportunity robustness is maximin across strength and assurance",()=>assert.equal(m.opportunityRobustness({commercialCoherence:.9,commercialStability:.8,knowledgeSufficiency:.7,reasoningConfidence:.6,constraintHeadroom:.85}),.6));
test("Pareto dominance true when no worse and one better",()=>assert.equal(m.paretoDominates({commercialCoherence:.9,commercialStability:.8,knowledgeSufficiency:.8,reasoningConfidence:.8,constraintHeadroom:.9},{commercialCoherence:.8,commercialStability:.8,knowledgeSufficiency:.7,reasoningConfidence:.8,constraintHeadroom:.9}),true));
test("Pareto dominance false for tradeoff",()=>assert.equal(m.paretoDominates({commercialCoherence:.95,commercialStability:.5,knowledgeSufficiency:.9,reasoningConfidence:.9,constraintHeadroom:.9},{commercialCoherence:.8,commercialStability:.8,knowledgeSufficiency:.8,reasoningConfidence:.8,constraintHeadroom:.8}),false));
test("equal vectors do not dominate",()=>{const v={commercialCoherence:.8,commercialStability:.8,knowledgeSufficiency:.8,reasoningConfidence:.8,constraintHeadroom:.8};assert.equal(m.paretoDominates(v,v),false)});

// Realisation hierarchy
test("actionable outranks stronger stranded fit",()=>{const r=m.orderOpportunities([c("stranded","STRANDED",{commercialCoherence:1,commercialStability:1,knowledgeSufficiency:1,reasoningConfidence:1,constraintPressure:0}),c("action","ACTIONABLE",{commercialCoherence:.6,commercialStability:.6,knowledgeSufficiency:.6,reasoningConfidence:.6,constraintPressure:.2})]);assert.equal(r.ordered[0].opportunityId,"action")});
test("valid organisational route shares actionable tier with named contact",()=>{const r=m.orderOpportunities([c("org","ACTIONABLE_WITHOUT_NAMED_CONTACT",{commercialCoherence:1,commercialStability:1,knowledgeSufficiency:1,reasoningConfidence:1,constraintPressure:0}),c("person","ACTIONABLE",{commercialCoherence:.55,commercialStability:.55,knowledgeSufficiency:.55,reasoningConfidence:.55,constraintPressure:.3})]);assert.equal(r.ordered[0].opportunityId,"org");assert.equal(r.ordered[0].realisationPrecedence,r.ordered[1].realisationPrecedence)});
test("unresolved outranks stranded",()=>{const r=m.orderOpportunities([c("s","STRANDED"),c("u","VIABLE_BUT_UNRESOLVED")]);assert.equal(r.ordered[0].opportunityId,"u")});
test("stranded outranks commercial unresolved",()=>{const r=m.orderOpportunities([c("s","STRANDED"),c("u","COMMERCIAL_REALITY_UNRESOLVED")]);assert.equal(r.ordered[0].opportunityId,"s")});
test("commercial unresolved outranks not viable",()=>{const r=m.orderOpportunities([c("n","NOT_VIABLE"),c("u","COMMERCIAL_REALITY_UNRESOLVED")]);assert.equal(r.ordered[0].opportunityId,"u")});

// Pareto/front behaviour
test("dominant actionable candidate gets earlier Pareto front",()=>{const r=m.orderOpportunities([c("a","ACTIONABLE",{commercialCoherence:.9,commercialStability:.9,knowledgeSufficiency:.9,reasoningConfidence:.9,constraintPressure:.1}),c("b","ACTIONABLE",{commercialCoherence:.8,commercialStability:.8,knowledgeSufficiency:.8,reasoningConfidence:.8,constraintPressure:.2})]);assert.equal(r.ordered[0].opportunityId,"a");assert.equal(r.ordered[0].paretoFront,1);assert.equal(r.ordered[1].paretoFront,2)});
test("tradeoff candidates share Pareto front",()=>{const r=m.orderOpportunities([c("a","ACTIONABLE",{commercialCoherence:.95,commercialStability:.55,knowledgeSufficiency:.9,reasoningConfidence:.9,constraintPressure:.1}),c("b","ACTIONABLE",{commercialCoherence:.8,commercialStability:.8,knowledgeSufficiency:.8,reasoningConfidence:.8,constraintPressure:.15})]);assert.equal(r.ordered[0].paretoFront,1);assert.equal(r.ordered[1].paretoFront,1)});
test("maximin prefers balanced tradeoff on same front",()=>{const r=m.orderOpportunities([c("spiky","ACTIONABLE",{commercialCoherence:.99,commercialStability:.5,knowledgeSufficiency:.95,reasoningConfidence:.95,constraintPressure:.01}),c("balanced","ACTIONABLE",{commercialCoherence:.78,commercialStability:.78,knowledgeSufficiency:.78,reasoningConfidence:.78,constraintPressure:.22})]);assert.equal(r.ordered[0].opportunityId,"balanced")});
test("low knowledge cannot be averaged away",()=>{const r=m.orderOpportunities([c("unknown","ACTIONABLE",{commercialCoherence:.99,commercialStability:.99,knowledgeSufficiency:.2,reasoningConfidence:.2,constraintPressure:.01}),c("known","ACTIONABLE",{commercialCoherence:.75,commercialStability:.75,knowledgeSufficiency:.9,reasoningConfidence:.9,constraintPressure:.2})]);assert.equal(r.ordered[0].opportunityId,"known")});
test("high coherence cannot hide boundary fragility",()=>{const r=m.orderOpportunities([c("fragile","ACTIONABLE",{commercialCoherence:.99,commercialStability:.3,knowledgeSufficiency:.9,reasoningConfidence:.9,constraintPressure:.01}),c("stable","ACTIONABLE",{commercialCoherence:.72,commercialStability:.72,knowledgeSufficiency:.8,reasoningConfidence:.8,constraintPressure:.25})]);assert.equal(r.ordered[0].opportunityId,"stable")});
test("heavy pressure reduces headroom and robustness",()=>{const lo=m.opportunityOrderingVector(c("lo","ACTIONABLE",{constraintPressure:.1}).realisation?c("lo","ACTIONABLE",{constraintPressure:.1}):null); const hi=m.opportunityOrderingVector(c("hi","ACTIONABLE",{constraintPressure:.8}));assert.ok(lo.constraintHeadroom>hi.constraintHeadroom)});

// Determinism and input guards
test("input order does not change final ordering",()=>{const a=c("a","ACTIONABLE",{commercialCoherence:.8});const b=c("b","ACTIONABLE",{commercialCoherence:.7});assert.deepEqual(m.orderOpportunities([a,b]).ordered.map(x=>x.opportunityId),m.orderOpportunities([b,a]).ordered.map(x=>x.opportunityId))});
test("true mathematical tie resolves by canonical opportunity id",()=>{const r=m.orderOpportunities([c("z"),c("a")]);assert.deepEqual(r.ordered.map(x=>x.opportunityId),["a","z"])});
test("duplicate opportunity id rejected",()=>assert.throws(()=>m.orderOpportunities([c("x"),{...c("y"),opportunityId:"x"}]),/DUPLICATE_OPPORTUNITY_ID/));
test("duplicate target entity rejected",()=>assert.throws(()=>m.orderOpportunities([c("x"),{...c("y"),targetEntityId:"target-x"}]),/DUPLICATE_TARGET_ENTITY/));
test("blank opportunity id rejected",()=>assert.throws(()=>m.orderOpportunities([{...c("x"),opportunityId:" "}]),/OPPORTUNITY_ID/));
test("blank target id rejected",()=>assert.throws(()=>m.orderOpportunities([{...c("x"),targetEntityId:" "}]),/TARGET_ENTITY_ID/));
test("weighted score field rejected",()=>assert.throws(()=>m.assertOpportunityCandidateInvariant({...c("x"),score:.9}),/FORBIDDEN_WEIGHTED_SCORE/));
test("weight field rejected",()=>assert.throws(()=>m.assertOpportunityCandidateInvariant({...c("x"),weight:.9}),/FORBIDDEN_WEIGHTED_SCORE/));
test("invalid realisation state rejected",()=>assert.throws(()=>m.assertOpportunityCandidateInvariant({...c("x"),realisation:{...c("x").realisation,state:"MAGIC"}}),/REALISATION_STATE/));
test("forged actionable state over eliminated commercial reality is rejected",()=>{const forged={...c("x","ACTIONABLE"),realisation:{...c("x","ACTIONABLE").realisation,commercial:{...c("x","ACTIONABLE").realisation.commercial,viability:"ELIMINATED",commercialCoherence:0,commercialStability:0}}};assert.throws(()=>m.orderOpportunities([forged]),/ELIMINATED_REALISATION_MISMATCH/)});
test("top helper returns requested number",()=>{const r=m.orderOpportunities([c("a"),c("b"),c("c"),c("d")]);assert.equal(m.topOrderedOpportunities(r,3).length,3)});
test("top helper zero allowed",()=>{const r=m.orderOpportunities([c("a")]);assert.equal(m.topOrderedOpportunities(r,0).length,0)});
test("top helper rejects negative",()=>{const r=m.orderOpportunities([c("a")]);assert.throws(()=>m.topOrderedOpportunities(r,-1),/TOP_LIMIT/)});
test("top helper rejects fractional",()=>{const r=m.orderOpportunities([c("a")]);assert.throws(()=>m.topOrderedOpportunities(r,1.5),/TOP_LIMIT/)});
test("summary counts states correctly",()=>{const r=m.orderOpportunities([c("a","ACTIONABLE"),c("b","ACTIONABLE_WITHOUT_NAMED_CONTACT"),c("u","VIABLE_BUT_UNRESOLVED"),c("cu","COMMERCIAL_REALITY_UNRESOLVED"),c("s","STRANDED"),c("n","NOT_VIABLE")]);assert.deepEqual([r.actionableCount,r.unresolvedCount,r.strandedCount,r.notViableCount],[2,2,1,1])});
test("rank is contiguous from one",()=>{const r=m.orderOpportunities([c("a"),c("b"),c("c")]);assert.deepEqual(r.ordered.map(x=>x.rank),[1,2,3])});
test("candidate input remains unmutated",()=>{const x=c("x");const before=JSON.stringify(x);m.orderOpportunities([x]);assert.equal(JSON.stringify(x),before)});

console.log(`\nGenesis T8 CE-R2 R5 adversarial runtime: ${pass}/34 passed.`);
if(process.exitCode) process.exit(process.exitCode);

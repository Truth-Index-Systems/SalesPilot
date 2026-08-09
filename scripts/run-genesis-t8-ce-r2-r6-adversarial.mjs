import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const modulePath=process.argv[2]; if(!modulePath) throw new Error("compiled module path required");
const m=await import(pathToFileURL(modulePath).href);
let pass=0; const test=(name,fn)=>{try{fn();pass++;console.log("PASS",name)}catch(e){console.error("FAIL",name,e);process.exitCode=1}};

const local=(o={})=>({constraintId:"c1",constraintClass:"SUPPORTING",applicability:"APPLICABLE",semanticPolarity:"SUPPORTS_REALITY",signedTruthSignal:.8,supportStrength:.8,limitingPressure:0,boundaryEliminationSupport:0,boundarySurvivalSupport:0,contradictionUncertainty:0,representedKnowledge:.7,knowledgeDeficit:.3,localState:"SUPPORTIVE",...o});
const ps=(id,o={})=>({constraintId:id,local:local({constraintId:id}),effectiveSupportStrength:.8,effectiveLimitingPressure:0,effectiveBoundaryEliminationSupport:0,effectiveBoundarySurvivalSupport:0,relevantContradictionUncertainty:0,effectiveKnowledgeDeficit:.3,incomingDependencyIds:[],...o});
const prop=(o={})=>({orderedConstraintIds:["c1","b1"],states:[ps("c1"),ps("b1",{local:local({constraintId:"b1",constraintClass:"BOUNDARY",localState:"UNRESOLVED"}),effectiveBoundarySurvivalSupport:.4,effectiveKnowledgeDeficit:.6})],viability:"SURVIVES",eliminatingConstraintIds:[],unresolvedBoundaryConstraintIds:[],...o});
const commercial=(o={})=>({viability:"SURVIVES",commercialCoherence:.8,constraintPressure:.1,commercialStability:.4,knowledgeSufficiency:.6,reasoningConfidence:.55,dimensions:[],nearestFailureBoundaryConstraintIds:["b1"],...o});
const opp=(state="ACTIONABLE",o={})=>({opportunityId:"opp1",targetEntityId:"target1",realisation:{state,commercial:commercial(o.commercial),contactState:o.contactState??"APPROPRIATE",routeState:o.routeState??"DIRECT",routeTargetMode:o.routeTargetMode??"PERSON",actionable:state==="ACTIONABLE"||state==="ACTIONABLE_WITHOUT_NAMED_CONTACT",reasonCode:"CONTACT_AND_ROUTE_AVAILABLE"}});
const q=(id,kind="CONSTRAINT",o={})=>({researchId:id,kind,semanticQuestionKey:o.semanticQuestionKey??`question.${id}`,constraintId:(kind==="CONSTRAINT"||kind==="CONTRADICTION")?(o.constraintId??"c1"):undefined,referencedTokenIds:o.referencedTokenIds??[],referencedRelationshipIds:o.referencedRelationshipIds??[]});

// Candidate contract guards
test("blank research id rejected",()=>assert.throws(()=>m.assertResearchCandidateInvariant({...q("x"),researchId:" "}),/RESEARCH_ID/));
test("invalid kind rejected",()=>assert.throws(()=>m.assertResearchCandidateInvariant({...q("x"),kind:"MAGIC"}),/KIND/));
test("blank semantic question rejected",()=>assert.throws(()=>m.assertResearchCandidateInvariant({...q("x"),semanticQuestionKey:" "}),/SEMANTIC_QUESTION_KEY/));
test("constraint candidate requires constraint id",()=>assert.throws(()=>m.assertResearchCandidateInvariant({...q("x"),constraintId:undefined}),/CONSTRAINT_ID_REQUIRED/));
test("contact cannot smuggle constraint id",()=>assert.throws(()=>m.assertResearchCandidateInvariant({...q("x","CONTACT"),constraintId:"c1"}),/REALISATION_CANDIDATE_CONSTRAINT_ID/));
test("blank token ref rejected",()=>assert.throws(()=>m.assertResearchCandidateInvariant({...q("x"),referencedTokenIds:[" "]}),/TOKEN_REFERENCE_SET/));
test("duplicate token ref rejected",()=>assert.throws(()=>m.assertResearchCandidateInvariant({...q("x"),referencedTokenIds:["t1","t1"]}),/TOKEN_REFERENCE_SET/));
test("numeric weight rejected",()=>assert.throws(()=>m.assertResearchCandidateInvariant({...q("x"),weight:.9}),/AI_NUMERIC_RESEARCH_WEIGHT/));
test("priority field rejected",()=>assert.throws(()=>m.assertResearchCandidateInvariant({...q("x"),priority:1}),/AI_NUMERIC_RESEARCH_WEIGHT/));

// Viability-pivotal unknowns
test("unresolved boundary is viability pivotal",()=>{const p=prop({viability:"UNRESOLVED",unresolvedBoundaryConstraintIds:["b1"]}); const r=m.evaluateResearchCandidate(opp("COMMERCIAL_REALITY_UNRESOLVED",{commercial:{viability:"UNRESOLVED"}}),p,q("qb","CONSTRAINT",{constraintId:"b1"}));assert.equal(r.impactClass,"VIABILITY_PIVOTAL")});
test("boundary contradiction can be viability pivotal",()=>{const p=prop({viability:"UNRESOLVED",unresolvedBoundaryConstraintIds:["b1"],states:[ps("c1"),ps("b1",{local:local({constraintId:"b1",constraintClass:"BOUNDARY"}),relevantContradictionUncertainty:.8,effectiveKnowledgeDeficit:0})]}); const r=m.evaluateResearchCandidate(opp("COMMERCIAL_REALITY_UNRESOLVED",{commercial:{viability:"UNRESOLVED"}}),p,q("qx","CONTRADICTION",{constraintId:"b1"}));assert.equal(r.impactClass,"VIABILITY_PIVOTAL");assert.equal(r.unresolvedMass,.8)});

// Realisation-pivotal contact/route
test("unknown contact on person route is realisation pivotal",()=>{const r=m.evaluateResearchCandidate(opp("VIABLE_BUT_UNRESOLVED",{contactState:"UNKNOWN"}),prop(),q("qc","CONTACT"));assert.equal(r.impactClass,"REALISATION_PIVOTAL")});
test("inappropriate person contact may warrant alternate contact research",()=>{const r=m.evaluateResearchCandidate(opp("STRANDED",{contactState:"INAPPROPRIATE"}),prop(),q("qc","CONTACT"));assert.equal(r.impactClass,"REALISATION_PIVOTAL")});
test("unknown route is realisation pivotal",()=>{const r=m.evaluateResearchCandidate(opp("VIABLE_BUT_UNRESOLVED",{routeState:"UNKNOWN"}),prop(),q("qr","ROUTE"));assert.equal(r.impactClass,"REALISATION_PIVOTAL")});
test("blocked route can trigger alternate route research",()=>{const r=m.evaluateResearchCandidate(opp("STRANDED",{routeState:"BLOCKED"}),prop(),q("qr","ROUTE"));assert.equal(r.impactClass,"REALISATION_PIVOTAL")});
test("contact is irrelevant for organisation route",()=>{const r=m.evaluateResearchCandidate(opp("ACTIONABLE_WITHOUT_NAMED_CONTACT",{contactState:"UNKNOWN",routeTargetMode:"ORGANISATION"}),prop(),q("qc","CONTACT"));assert.equal(r.impactClass,"NO_DECISION_VALUE")});

// Stability and assurance
test("nearest surviving boundary with deficit is stability pivotal",()=>{const r=m.evaluateResearchCandidate(opp(),prop(),q("qb","CONSTRAINT",{constraintId:"b1"}));assert.equal(r.impactClass,"STABILITY_PIVOTAL")});
test("general constraint deficit is assurance gap",()=>{const r=m.evaluateResearchCandidate(opp(),prop(),q("q1","CONSTRAINT",{constraintId:"c1"}));assert.equal(r.impactClass,"ASSURANCE_GAP");assert.equal(r.unresolvedMass,.3)});
test("active contradiction is assurance gap",()=>{const p=prop({states:[ps("c1",{relevantContradictionUncertainty:.7,effectiveKnowledgeDeficit:0}),ps("b1",{local:local({constraintId:"b1",constraintClass:"BOUNDARY"}),effectiveBoundarySurvivalSupport:.7,effectiveKnowledgeDeficit:0})]});const r=m.evaluateResearchCandidate(opp({}),p,q("qx","CONTRADICTION",{constraintId:"c1"}));assert.equal(r.impactClass,"ASSURANCE_GAP");assert.equal(r.unresolvedMass,.7)});
test("zero deficit has no decision value",()=>{const p=prop({states:[ps("c1",{effectiveKnowledgeDeficit:0}),ps("b1",{local:local({constraintId:"b1",constraintClass:"BOUNDARY"}),effectiveBoundarySurvivalSupport:.7,effectiveKnowledgeDeficit:0})]});const r=m.evaluateResearchCandidate(opp(),p,q("q1"));assert.equal(r.impactClass,"NO_DECISION_VALUE")});
test("not applicable deficit has no decision value",()=>{const p=prop({states:[ps("c1",{local:local({constraintId:"c1",applicability:"NOT_APPLICABLE"}),effectiveKnowledgeDeficit:.9}),ps("b1")]});const r=m.evaluateResearchCandidate(opp(),p,q("q1"));assert.equal(r.impactClass,"NO_DECISION_VALUE")});
test("missing constraint rejected",()=>assert.throws(()=>m.evaluateResearchCandidate(opp(),prop(),q("qm","CONSTRAINT",{constraintId:"missing"})),/CONSTRAINT_NOT_IN_PROPAGATION/));

// Ordering law
test("viability pivotal outranks route pivotal",()=>{const p=prop({viability:"UNRESOLVED",unresolvedBoundaryConstraintIds:["b1"]});const o=opp("COMMERCIAL_REALITY_UNRESOLVED",{commercial:{viability:"UNRESOLVED"},routeState:"UNKNOWN"});const s=m.selectNextResearchForOpportunity(o,p,[q("route","ROUTE"),q("boundary","CONSTRAINT",{constraintId:"b1"})]);assert.equal(s.next.researchId,"boundary")});
test("realisation pivotal outranks stability",()=>{const o=opp("VIABLE_BUT_UNRESOLVED",{routeState:"UNKNOWN"});const s=m.selectNextResearchForOpportunity(o,prop(),[q("boundary","CONSTRAINT",{constraintId:"b1"}),q("route","ROUTE")]);assert.equal(s.next.researchId,"route")});
test("stability pivotal outranks assurance gap",()=>{const s=m.selectNextResearchForOpportunity(opp(),prop(),[q("general","CONSTRAINT",{constraintId:"c1"}),q("boundary","CONSTRAINT",{constraintId:"b1"})]);assert.equal(s.next.researchId,"boundary")});
test("same class prefers larger unresolved mass",()=>{const p=prop({states:[ps("c1",{effectiveKnowledgeDeficit:.2}),ps("c2",{effectiveKnowledgeDeficit:.8}),ps("b1",{local:local({constraintId:"b1",constraintClass:"BOUNDARY"}),effectiveBoundarySurvivalSupport:.8,effectiveKnowledgeDeficit:0})],orderedConstraintIds:["c1","c2","b1"]});const s=m.selectNextResearchForOpportunity(opp({}),p,[q("low","CONSTRAINT",{constraintId:"c1"}),q("high","CONSTRAINT",{constraintId:"c2"})]);assert.equal(s.next.researchId,"high")});
test("true tie resolves by research id",()=>{const p=prop({states:[ps("c1",{effectiveKnowledgeDeficit:.4}),ps("c2",{effectiveKnowledgeDeficit:.4}),ps("b1",{local:local({constraintId:"b1",constraintClass:"BOUNDARY"}),effectiveBoundarySurvivalSupport:.8,effectiveKnowledgeDeficit:0})],orderedConstraintIds:["c1","c2","b1"]});const s=m.selectNextResearchForOpportunity(opp(),p,[q("z","CONSTRAINT",{constraintId:"c1"}),q("a","CONSTRAINT",{constraintId:"c2"})]);assert.equal(s.next.researchId,"a")});
test("input order does not change research choice",()=>{const a=q("a","CONSTRAINT",{constraintId:"c1"});const b=q("b","CONSTRAINT",{constraintId:"b1"});assert.equal(m.selectNextResearchForOpportunity(opp(),prop(),[a,b]).next.researchId,m.selectNextResearchForOpportunity(opp(),prop(),[b,a]).next.researchId)});
test("duplicate research id rejected",()=>assert.throws(()=>m.selectNextResearchForOpportunity(opp(),prop(),[q("x"),q("x","ROUTE")]),/DUPLICATE_RESEARCH_ID/));
test("duplicate semantic question rejected",()=>assert.throws(()=>m.selectNextResearchForOpportunity(opp(),prop(),[q("x"),q("y","ROUTE",{semanticQuestionKey:"question.x"})]),/DUPLICATE_SEMANTIC_QUESTION/));

// Stop rules and definitive outcomes
test("no candidates means no research",()=>{const s=m.selectNextResearchForOpportunity(opp(),prop(),[]);assert.equal(s.researchRequired,false);assert.equal(s.next,undefined)});
test("fully resolved candidate means no research",()=>{const p=prop({states:[ps("c1",{effectiveKnowledgeDeficit:0}),ps("b1",{local:local({constraintId:"b1",constraintClass:"BOUNDARY"}),effectiveBoundarySurvivalSupport:.9,effectiveKnowledgeDeficit:0})]});const s=m.selectNextResearchForOpportunity(opp(),p,[q("done")]);assert.equal(s.researchRequired,false)});
test("definitive not viable does not prioritise route",()=>{const o=opp("NOT_VIABLE",{commercial:{viability:"ELIMINATED"},routeState:"UNKNOWN"});const r=m.evaluateResearchCandidate(o,prop({viability:"ELIMINATED",eliminatingConstraintIds:["b1"]}),q("route","ROUTE"));assert.equal(r.impactClass,"NO_DECISION_VALUE")});
test("unknown information never changes commercial fields",()=>{const o=opp();const before=JSON.stringify(o.realisation.commercial);m.selectNextResearchForOpportunity(o,prop(),[q("q1")]);assert.equal(JSON.stringify(o.realisation.commercial),before)});

// Portfolio behaviour
test("portfolio respects supplied R5 opportunity order",()=>{const o1={...opp("ACTIONABLE"),opportunityId:"top",targetEntityId:"t-top"};const o2={...opp("VIABLE_BUT_UNRESOLVED",{routeState:"UNKNOWN"}),opportunityId:"lower",targetEntityId:"t-lower"};const p1=prop();const p2=prop();const s=m.selectNextPortfolioResearch([o1,o2],new Map([["top",p1],["lower",p2]]),new Map([["top",[q("top-q","CONSTRAINT",{constraintId:"c1"})]],["lower",[q("lower-route","ROUTE")]]]));assert.equal(s.next.opportunityId,"top")});
test("portfolio skips resolved top opportunity and researches next",()=>{const o1={...opp(),opportunityId:"top",targetEntityId:"t-top"};const o2={...opp("VIABLE_BUT_UNRESOLVED",{routeState:"UNKNOWN"}),opportunityId:"lower",targetEntityId:"t-lower"};const resolved=prop({states:[ps("c1",{effectiveKnowledgeDeficit:0}),ps("b1",{local:local({constraintId:"b1",constraintClass:"BOUNDARY"}),effectiveBoundarySurvivalSupport:.9,effectiveKnowledgeDeficit:0})]});const s=m.selectNextPortfolioResearch([o1,o2],new Map([["top",resolved],["lower",prop()]]),new Map([["top",[q("done")]],["lower",[q("route","ROUTE")]]]));assert.equal(s.next.opportunityId,"lower")});
test("portfolio missing propagation rejected",()=>assert.throws(()=>m.selectNextPortfolioResearch([opp()],new Map(),new Map()),/PROPAGATION_MISSING/));
test("portfolio with no unresolved research returns none",()=>{const o=opp();const resolved=prop({states:[ps("c1",{effectiveKnowledgeDeficit:0}),ps("b1",{local:local({constraintId:"b1",constraintClass:"BOUNDARY"}),effectiveBoundarySurvivalSupport:.9,effectiveKnowledgeDeficit:0})]});const s=m.selectNextPortfolioResearch([o],new Map([["opp1",resolved]]),new Map([["opp1",[]]]));assert.equal(s.researchRequired,false);assert.equal(s.next,undefined)});

console.log(`\nGenesis T8 CE-R2 R6 adversarial runtime: ${pass}/38 passed.`);
if(process.exitCode) process.exit(process.exitCode);

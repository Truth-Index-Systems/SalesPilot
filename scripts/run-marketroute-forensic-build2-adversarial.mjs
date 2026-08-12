import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const modPath=process.argv[2]; if(!modPath) throw new Error("compiled producer module path required");
const m=await import(pathToFileURL(modPath));
let pass=0; const test=(name,fn)=>{fn();pass+=1;console.log("PASS",name)};
const contribution=(claimKey,{support=.7,contradiction=0,sufficiency=.7,severity=0,represented=true,reviewState="AUTO"}={})=>({
  claimKey,impactClass:"FOUNDATIONAL",weight:1,represented,supportStrength:represented?support:0,contradictionStrength:represented?contradiction:0,
  relationshipContradictionStrength:0,directContradictionSeverity:severity,directReviewState:reviewState,
  evidenceBalance:represented?support:null,evidenceSufficiency:represented?sufficiency:0,truthProbability:null,probabilityState:"UNCALIBRATED",
  weightedEvidenceBalanceMass:represented?support:0,contradictionSeverity:severity,reviewState,dependencyConstrained:false,evidenceCount:represented?1:0,
  dependenceFamilyCount:represented?1:0,undatedEvidenceCount:0,minimumFreshnessModifier:represented?1:0,
});
const truth=(overrides={})=>{
  const keys=["identity","canonical_domain","current_operation","industry","sector","geography","offering","customer_market","company_scale","commercial_problems","buying_signals","contact_coverage","route_coverage"];
  const contributions=keys.map((key)=>contribution(key,overrides[key]??{}));
  return {engineVersion:"MR-TI-2.0",contractVersion:"MR-TI-2-CONTRACTS-1.0",truthSemanticsVersion:"MR-TI-2-TFR1",entityType:"company",
    state:{truthIndex:50,evidenceSufficiency:70,representedConfidence:70,coverage:100,foundationalIntegrity:60,foundationalIntegrityRepresented:true,foundationalModifier:.6,baseTruth:70,maxContradictionSeverity:0,reviewState:"AUTO",calibratedProbabilityCoverage:0,probabilityState:"UNCALIBRATED"},
    diagnostics:{missingClaims:[],contradictedClaims:[],dependencyConstrainedClaims:[],limitingClaims:[],temporallyUncertainClaims:[],contributions},calculatedAt:"2026-08-12T18:30:00.000Z"};
};
const seller={sellerEntityId:"gen:seller:test-org",selectedCommercialObjectiveId:"objective:test",sellerContextFingerprint:"seller-fp",constraintFingerprint:"constraint-fp-0123456789abcdef0123456789abcdef",
  boundaryConstraints:[
    {constraintId:"seller-offer",semanticDependencyKey:"seller.has_persisted_commercial_offering",sourceValues:["Offer"],relevantDimensions:["COMMERCIAL","OPERATIONAL"]},
    {constraintId:"seller-objective",semanticDependencyKey:"seller.selected_commercial_objective",sourceValues:["Acquire customers"],relevantDimensions:["STRATEGIC","COMMERCIAL"]},
  ],
  limitingConstraints:[
    {constraintId:"industry-pref",semanticDependencyKey:"seller.icp.0.industries",sourceValues:["SaaS"],relevantDimensions:["COMMERCIAL","STRATEGIC"]},
    {constraintId:"geo-pref",semanticDependencyKey:"seller.icp.0.geographies",sourceValues:["United Kingdom"],relevantDimensions:["STRUCTURAL","COMMERCIAL"]},
    {constraintId:"role-pref",semanticDependencyKey:"seller.icp.0.buyer_roles",sourceValues:["COO"],relevantDimensions:["RELATIONAL","COMMERCIAL"]},
  ]};
const baseInput=(targetTruth=truth(),facts={industry:"SaaS",country:"UK"})=>({opportunityId:"11111111-1111-4111-8111-111111111111",targetTruthEntityId:"22222222-2222-4222-8222-222222222222",targetTruthSnapshotId:"33333333-3333-4333-8333-333333333333",targetTruth,seller,targetFacts:{companyId:"44444444-4444-4444-8444-444444444444",companyName:"Acme",canonicalDomain:"acme.test",industry:facts.industry??null,country:facts.country??null},referenceTime:"2026-08-12T18:30:00.000Z"});

test("weak positive TFR1 evidence cannot become opposition",()=>{const p=m.produceForensicBuild2CommercialReality(baseInput(truth({identity:{support:.2,sufficiency:.2},current_operation:{support:.2,sufficiency:.2}})));const id=p.localConstraints.find(x=>x.constraintId.startsWith("mrfb2:")&&x.localState.includes("BOUNDARY"));assert.ok(id);assert.ok(id.signedTruthSignal>0);assert.equal(p.propagation.viability,"SURVIVES");});
test("uncalibrated represented target facts produce POSSIBLE not ESTABLISHED",()=>{const p=m.produceForensicBuild2CommercialReality(baseInput());assert.equal(p.composition.decision.state,"POSSIBLE");assert.equal(p.decision.disposition,"COMMERCIAL_CANDIDATE");assert.ok(p.composition.knowledge.some(k=>k.knowledgeId.endsWith(":identity")&&k.epistemic.primaryState==="UNCERTAIN"));});
test("missing decision-critical current operation fails closed",()=>{const p=m.produceForensicBuild2CommercialReality(baseInput(truth({current_operation:{represented:false}})));assert.equal(p.propagation.viability,"UNRESOLVED");assert.equal(p.composition.decision.state,"UNRESOLVED");assert.equal(p.decision.disposition,"RESEARCH_REQUIRED");});
test("stronger contradiction on a mandatory boundary can eliminate",()=>{const p=m.produceForensicBuild2CommercialReality(baseInput(truth({current_operation:{support:.2,contradiction:.8,severity:.1,sufficiency:.84}})));assert.equal(p.propagation.viability,"ELIMINATED");assert.equal(p.composition.decision.state,"IMPOSSIBLE");assert.equal(p.decision.disposition,"REJECT");});
test("industry mismatch creates pressure but never hard elimination",()=>{const p=m.produceForensicBuild2CommercialReality(baseInput(truth(),{industry:"Manufacturing",country:"UK"}));const limiting=p.localConstraints.find(x=>x.constraintClass==="LIMITING"&&x.limitingPressure>0);assert.ok(limiting);assert.equal(p.propagation.viability,"SURVIVES");});
test("UK geography alias matches United Kingdom without pressure",()=>{const p=m.produceForensicBuild2CommercialReality(baseInput());const geo=p.constraintContexts.find(x=>x.reinforcementGroupKey==="target.preference.geography");assert.ok(geo);const state=p.localConstraints.find(x=>x.constraintId===geo.constraintId);assert.equal(state.limitingPressure,0);});
test("unsupported buyer-role relation is deferred not fabricated",()=>{const p=m.produceForensicBuild2CommercialReality(baseInput());assert.ok(p.deferredSellerConstraintIds.includes("role-pref"));assert.equal(p.localConstraints.some(x=>x.constraintId==="role-pref"),false);});
test("seller source confidence is not part of authority input",()=>{const p=m.produceForensicBuild2CommercialReality(baseInput());assert.equal(JSON.stringify(p).includes("sourceConfidence"),false);});
test("input fingerprint is deterministic",()=>{const a=m.produceForensicBuild2CommercialReality(baseInput());const b=m.produceForensicBuild2CommercialReality(baseInput());assert.equal(a.inputFingerprint,b.inputFingerprint);assert.match(a.inputFingerprint,/^[0-9a-f]{64}$/);});
test("relationship-derived numeric contradiction cannot become Build-2 R4 authority",()=>{const t=truth();const contributions=t.diagnostics.contributions.map(x=>x.claimKey==="current_operation"?{...x,relationshipContradictionStrength:.95,contradictionSeverity:.95,reviewState:"HUMAN_REVIEW_REQUIRED",directContradictionSeverity:0,directReviewState:"AUTO"}:x);const p=m.produceForensicBuild2CommercialReality(baseInput({...t,diagnostics:{...t.diagnostics,contributions}}));assert.equal(p.propagation.viability,"SURVIVES");assert.equal(p.composition.decision.state,"POSSIBLE");});
test("wrong Truth semantics is rejected",()=>{const t={...truth(),truthSemanticsVersion:"MR-TI-2-LEGACY"};assert.throws(()=>m.produceForensicBuild2CommercialReality(baseInput(t)),/REQUIRES_TFR1_TRUTH/);});
test("R4 cannot unlock engagement",()=>{const p=m.produceForensicBuild2CommercialReality(baseInput());assert.equal(p.decision.canUnlockEngagement,false);});
test("commercial reality target identity is deterministic from Truth entity",()=>{const p=m.produceForensicBuild2CommercialReality(baseInput());assert.equal(p.targetCommercialEntityId,"gen:g8:company:22222222-2222-4222-8222-222222222222");assert.equal(p.decision.targetEntityId,p.targetCommercialEntityId);});
console.log(`\nMarketRoute Forensic Build 2 adversarial runtime: ${pass}/13 passed.`);

import { pathToFileURL } from "node:url";
const modPath = process.argv[2];
if (!modPath) throw new Error("CE2_R1_RUNTIME_MODULE_REQUIRED");
const m = await import(pathToFileURL(modPath).href);
let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const expectThrow = (fn, token) => {
  try { fn(); } catch (error) { if (String(error?.message ?? error).includes(token)) return; throw error; }
  throw new Error(`EXPECTED_THROW:${token}`);
};

const dimensions = Object.freeze([]);
const knowledgeChannels = Object.freeze({ viability: 1, stability: 1, enrichment: 1 });
const commercial = (viability, overrides={}) => Object.freeze({
  viability,
  commercialCoherence: viability === "SURVIVES" ? 0.72 : 0,
  constraintPressure: viability === "SURVIVES" ? 0.15 : 0.3,
  commercialStability: viability === "SURVIVES" ? 0.8 : 0,
  knowledgeSufficiency: viability === "UNRESOLVED" ? 0 : 1,
  knowledgeChannels: viability === "UNRESOLVED" ? Object.freeze({ viability: 0, stability: 0, enrichment: 1 }) : knowledgeChannels,
  reasoningConfidence: viability === "UNRESOLVED" ? 0 : 0.9,
  dimensions,
  nearestFailureBoundaryConstraintIds: Object.freeze(viability === "SURVIVES" ? ["constraint-boundary"] : []),
  ...overrides,
});
const identity = Object.freeze({ sellerEntityId:"seller-1", offeringEntityId:"offering-1", targetEntityId:"target-1", commercialObjectiveId:"objective-1" });
const input = (state, extra={}) => ({ identity, commercial: state, governingConstraintIds:["constraint-2","constraint-1"], supportingEvidenceTokenIds:["evidence-2","evidence-1"], ...extra });

test("deterministic reality identity", () => {
  const a=m.commercialRealityId(identity), b=m.commercialRealityId({...identity});
  if(a!==b) throw new Error("IDENTITY_NON_DETERMINISTIC");
  if(!a.includes("objective-1")) throw new Error("OBJECTIVE_NOT_IN_IDENTITY");
});
test("identity independent of state", () => {
  const a=m.evaluateCommercialReality(input(commercial("SURVIVES")));
  const b=m.evaluateCommercialReality(input(commercial("UNRESOLVED")));
  if(a.realityId!==b.realityId) throw new Error("IDENTITY_DRIFT");
});
test("canonical set order produces same fingerprint", () => {
  const a=m.evaluateCommercialReality(input(commercial("SURVIVES")));
  const b=m.evaluateCommercialReality({ ...input(commercial("SURVIVES")), governingConstraintIds:["constraint-1","constraint-2"], supportingEvidenceTokenIds:["evidence-1","evidence-2"] });
  if(a.mathematicalFingerprint!==b.mathematicalFingerprint) throw new Error("ORDER_AFFECTED_FINGERPRINT");
});
test("first unresolved reality is emerging", () => {
  const r=m.evaluateCommercialReality(input(commercial("UNRESOLVED")));
  if(r.lifecycleState!=="EMERGING"||r.trace.stateReason!=="VIABILITY_NOT_YET_RESOLVED") throw new Error("EMERGING_STATE");
});
test("first surviving reality is established", () => {
  const r=m.evaluateCommercialReality(input(commercial("SURVIVES")));
  if(r.lifecycleState!=="ESTABLISHED") throw new Error("ESTABLISHED_STATE");
});
test("eliminated reality is resolved", () => {
  const r=m.evaluateCommercialReality(input(commercial("ELIMINATED")));
  if(r.lifecycleState!=="RESOLVED") throw new Error("RESOLVED_STATE");
});
test("same canonical state remains established", () => {
  const previous=m.evaluateCommercialReality(input(commercial("SURVIVES")));
  const current=m.evaluateCommercialReality(input(commercial("SURVIVES"), {previousReality:previous}));
  if(current.lifecycleState!=="ESTABLISHED") throw new Error("UNCHANGED_REALITY_CHANGED");
});
test("changed canonical state becomes changing", () => {
  const previous=m.evaluateCommercialReality(input(commercial("SURVIVES")));
  const changed=commercial("SURVIVES", { commercialCoherence:0.61 });
  const current=m.evaluateCommercialReality(input(changed, {previousReality:previous}));
  if(current.lifecycleState!=="CHANGING"||current.realityId!==previous.realityId) throw new Error("CHANGING_STATE");
});
test("different previous identity rejected", () => {
  const previous=m.evaluateCommercialReality(input(commercial("SURVIVES")));
  const otherIdentity={...identity,targetEntityId:"target-2"};
  expectThrow(()=>m.evaluateCommercialReality({identity:otherIdentity,commercial:commercial("SURVIVES"),governingConstraintIds:["c"],previousReality:previous}),"PREVIOUS_REALITY_IDENTITY_MISMATCH");
});
test("objective mandatory", () => {
  expectThrow(()=>m.commercialRealityId({...identity,commercialObjectiveId:""}),"COMMERCIAL_OBJECTIVE_ID");
});
test("governing constraint mandatory", () => {
  expectThrow(()=>m.evaluateCommercialReality({identity,commercial:commercial("SURVIVES"),governingConstraintIds:[]}),"COMMERCIAL_REALITY_REQUIRES_GOVERNING_CONSTRAINT");
});
test("duplicate governing constraint rejected", () => {
  expectThrow(()=>m.evaluateCommercialReality({identity,commercial:commercial("SURVIVES"),governingConstraintIds:["c","c"]}),"DUPLICATE_GOVERNING_CONSTRAINT_ID");
});
test("numeric scoring authority rejected", () => {
  expectThrow(()=>m.evaluateCommercialReality({...input(commercial("SURVIVES")),score:0.99}),"FORBIDDEN_AUTHORITY_FIELD:INPUT:score");
});
test("opportunity projection preserves target and realisation", () => {
  const reality=m.evaluateCommercialReality(input(commercial("SURVIVES")));
  const realisation=Object.freeze({state:"ACTIONABLE",commercial:reality.commercial,contactState:"APPROPRIATE",routeState:"DIRECT",routeTargetMode:"PERSON",actionable:true,reasonCode:"CONTACT_AND_ROUTE_AVAILABLE"});
  const projected=m.projectOpportunityFromCommercialReality(reality,{opportunityId:"opp-1",realisation});
  if(projected.targetEntityId!==identity.targetEntityId||projected.realisation!==realisation) throw new Error("PROJECTION_CHANGED_LEGACY_STATE");
});
test("opportunity projection cannot substitute commercial state", () => {
  const reality=m.evaluateCommercialReality(input(commercial("SURVIVES")));
  const other=commercial("SURVIVES",{commercialCoherence:0.4});
  const realisation=Object.freeze({state:"ACTIONABLE",commercial:other,contactState:"APPROPRIATE",routeState:"DIRECT",routeTargetMode:"PERSON",actionable:true,reasonCode:"CONTACT_AND_ROUTE_AVAILABLE"});
  expectThrow(()=>m.projectOpportunityFromCommercialReality(reality,{opportunityId:"opp-1",realisation}),"OPPORTUNITY_PROJECTION_COMMERCIAL_STATE_MISMATCH");
});
test("trace is deterministic and references failure boundaries", () => {
  const r=m.evaluateCommercialReality(input(commercial("SURVIVES")));
  if(r.trace.nearestFailureBoundaryConstraintIds[0]!=="constraint-boundary"||r.trace.deterministicRules.length<5) throw new Error("TRACE_INCOMPLETE");
});
test("reality invariant detects forged fingerprint", () => {
  const r=m.evaluateCommercialReality(input(commercial("SURVIVES")));
  expectThrow(()=>m.assertCommercialRealityInvariant({...r,mathematicalFingerprint:"0000000000000000"}),"FINGERPRINT_MISMATCH");
});

for (const [name, fn] of tests) {
  try { fn(); passed += 1; console.log(`PASS ${name}`); }
  catch (error) { console.error(`FAIL ${name}:`, error); process.exitCode=1; break; }
}
if (process.exitCode) process.exit(process.exitCode);
console.log(`PASS CE2-R1 Commercial Reality adversarial suite ${passed}/${tests.length}`);

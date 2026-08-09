import { pathToFileURL } from 'node:url';
const mod = await import(pathToFileURL(process.argv[2]).href);
let pass=0, total=0;
const test=(name,fn)=>{total++;try{fn();console.log('PASS',name);pass++;}catch(e){console.error('FAIL',name,e?.message||e);}};
const throws=(fn)=>{let ok=false;try{fn();}catch{ok=true;}if(!ok)throw new Error('expected throw');};
const local=(id, cls, overrides={})=>({constraintId:id,constraintClass:cls,applicability:'APPLICABLE',truthSignal:0.9,knowledgeSufficiency:0.9,knowledgeDeficit:0.1,supportStrength:cls==='SUPPORTING'?0.8:0,limitingPressure:cls==='LIMITING'?0.4:0,boundaryEliminationSupport:0,boundarySurvivalSupport:cls==='BOUNDARY'?0.9:0,contradictionUncertainty:0,...overrides});
const states=[
 {constraintId:'b',local:local('b','BOUNDARY'),effectiveSupportStrength:0,effectiveLimitingPressure:0,effectiveBoundaryEliminationSupport:0,effectiveBoundarySurvivalSupport:0.9,relevantContradictionUncertainty:0,effectiveKnowledgeDeficit:0.1,incomingDependencyIds:[]},
 {constraintId:'s',local:local('s','SUPPORTING'),effectiveSupportStrength:0.8,effectiveLimitingPressure:0,effectiveBoundaryEliminationSupport:0,effectiveBoundarySurvivalSupport:0,relevantContradictionUncertainty:0,effectiveKnowledgeDeficit:0.1,incomingDependencyIds:['d1']},
 {constraintId:'l',local:local('l','LIMITING'),effectiveSupportStrength:0,effectiveLimitingPressure:0.4,effectiveBoundaryEliminationSupport:0,effectiveBoundarySurvivalSupport:0,relevantContradictionUncertainty:0,effectiveKnowledgeDeficit:0.2,incomingDependencyIds:[]},
 {constraintId:'x',local:local('x','CONTRADICTORY',{contradictionUncertainty:0.3}),effectiveSupportStrength:0,effectiveLimitingPressure:0,effectiveBoundaryEliminationSupport:0,effectiveBoundarySurvivalSupport:0,relevantContradictionUncertainty:0.3,effectiveKnowledgeDeficit:0.3,incomingDependencyIds:[]},
 {constraintId:'u',local:local('u','UNKNOWN',{applicability:'UNRESOLVED',knowledgeDeficit:0.7}),effectiveSupportStrength:0,effectiveLimitingPressure:0,effectiveBoundaryEliminationSupport:0,effectiveBoundarySurvivalSupport:0,relevantContradictionUncertainty:0,effectiveKnowledgeDeficit:0.7,incomingDependencyIds:[]},
];
const propagation={orderedConstraintIds:['b','l','s','u','x'],states,viability:'SURVIVES',eliminatingConstraintIds:[],unresolvedBoundaryConstraintIds:[]};
const commercial={viability:'SURVIVES',commercialCoherence:0.72,constraintPressure:0.4,commercialStability:0.9,knowledgeSufficiency:0.7,reasoningConfidence:0.8,dimensions:[],nearestFailureBoundaryConstraintIds:['b']};
const realisation={state:'ACTIONABLE',commercial,contactState:'APPROPRIATE',routeState:'DIRECT',routeTargetMode:'PERSON',actionable:true,reasonCode:'CONTACT_AND_ROUTE_AVAILABLE'};
const opportunity={opportunityId:'opp1',targetEntityId:'target1',realisation};
const order={opportunityId:'opp1',targetEntityId:'target1',realisationState:'ACTIONABLE',realisationPrecedence:5,vector:{commercialCoherence:.72,commercialStability:.9,knowledgeSufficiency:.7,reasoningConfidence:.8,constraintHeadroom:.6},commercialStrength:.6,decisionAssurance:.7,opportunityRobustness:.6,paretoFront:1,rank:1};
const contract=(id,cls,app='APPLICABLE')=>({constraintId:id,constraintClass:cls,sellerEntityId:'seller',offeringEntityId:'offer',targetEntityId:'target1',canonicalSubjectTokenIds:[`st-${id}`],canonicalTargetTokenIds:[`tt-${id}`],canonicalRelationshipIds:[`rel-${id}`],relevantDimensions:['COMMERCIAL'],applicability:app,semanticDependencyKey:`sem-${id}`,evidenceIds:[`ev-${id}`]});
const contracts=[contract('b','BOUNDARY'),contract('s','SUPPORTING'),contract('l','LIMITING'),contract('x','CONTRADICTORY'),contract('u','UNKNOWN','UNRESOLVED')];
const research={opportunityId:'opp1',targetEntityId:'target1',orderedCandidates:[],researchRequired:true,next:{researchId:'r1',semanticQuestionKey:'procurement.route',kind:'ROUTE',impactClass:'REALISATION_PIVOTAL',impactPrecedence:3,unresolvedMass:1,nearestFailureBoundary:false,reasonCode:'ROUTE_CAN_CHANGE_REALISATION'}};
const trace=mod.buildOpportunityExplanationTrace(opportunity,order,propagation,contracts,research);
test('preserves viability',()=>{if(trace.viability!=='SURVIVES')throw 0});
test('preserves rank',()=>{if(trace.rank!==1)throw 0});
test('preserves coherence',()=>{if(trace.commercialCoherence!==.72)throw 0});
test('support classified',()=>{if(!trace.supportingConstraintIds.includes('s'))throw 0});
test('limiting classified',()=>{if(!trace.limitingConstraintIds.includes('l'))throw 0});
test('contradiction classified',()=>{if(!trace.contradictoryConstraintIds.includes('x'))throw 0});
test('unknown classified',()=>{if(!trace.unknownConstraintIds.includes('u'))throw 0});
test('nearest boundary preserved',()=>{if(!trace.nearestFailureBoundaryConstraintIds.includes('b'))throw 0});
test('token references preserved',()=>{if(!trace.constraintTraces.find(x=>x.constraintId==='s').referencedTokenIds.includes('st-s'))throw 0});
test('relationship references preserved',()=>{if(!trace.constraintTraces.find(x=>x.constraintId==='s').referencedRelationshipIds.includes('rel-s'))throw 0});
test('evidence references preserved',()=>{if(!trace.constraintTraces.find(x=>x.constraintId==='s').evidenceIds.includes('ev-s'))throw 0});
test('dependency references preserved',()=>{if(!trace.constraintTraces.find(x=>x.constraintId==='s').incomingDependencyIds.includes('d1'))throw 0});
test('R6 priority preserved',()=>{if(trace.nextResearch?.researchId!=='r1')throw 0});
test('AI envelope explain only',()=>{if(mod.createAIExplanationEnvelope(trace).instruction!=='EXPLAIN_TRACE_ONLY')throw 0});
test('AI envelope freezes rank mutation',()=>{if(!mod.createAIExplanationEnvelope(trace).forbiddenMutations.includes('RANK'))throw 0});
test('order identity mismatch fails',()=>throws(()=>mod.buildOpportunityExplanationTrace(opportunity,{...order,opportunityId:'other'},propagation,contracts)));
test('target identity mismatch fails',()=>throws(()=>mod.buildOpportunityExplanationTrace(opportunity,{...order,targetEntityId:'other'},propagation,contracts)));
test('viability mismatch fails',()=>throws(()=>mod.buildOpportunityExplanationTrace(opportunity,order,{...propagation,viability:'ELIMINATED'},contracts)));
test('realisation mismatch fails',()=>throws(()=>mod.buildOpportunityExplanationTrace(opportunity,{...order,realisationState:'STRANDED'},propagation,contracts)));
test('duplicate contract fails',()=>throws(()=>mod.buildOpportunityExplanationTrace(opportunity,order,propagation,[...contracts,contracts[0]])));
test('missing contract fails',()=>throws(()=>mod.buildOpportunityExplanationTrace(opportunity,order,propagation,contracts.slice(1))));
test('unknown propagated contract fails',()=>throws(()=>mod.buildOpportunityExplanationTrace(opportunity,order,propagation,[...contracts.slice(0,-1),contract('zzz','UNKNOWN')])));
test('research opportunity mismatch fails',()=>throws(()=>mod.buildOpportunityExplanationTrace(opportunity,order,propagation,contracts,{...research,opportunityId:'other'})));
test('research target mismatch fails',()=>throws(()=>mod.buildOpportunityExplanationTrace(opportunity,order,propagation,contracts,{...research,targetEntityId:'other'})));
test('trace is frozen',()=>{if(!Object.isFrozen(trace)||!Object.isFrozen(trace.constraintTraces))throw 0});
test('AI envelope is frozen',()=>{if(!Object.isFrozen(mod.createAIExplanationEnvelope(trace)))throw 0});
console.log(`Genesis T8 CE-R2 R7 adversarial runtime: ${pass}/${total}`); if(pass!==total)process.exit(1);

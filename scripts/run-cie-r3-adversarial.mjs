import {pathToFileURL} from 'node:url';
const m=await import(pathToFileURL(process.argv[2]).href);
let pass=0; const ok=(x,msg)=>{if(!x)throw new Error(msg);pass++;};
const commercial={
  viability:'SURVIVES',commercialCoherence:.8,constraintPressure:.2,commercialStability:.8,knowledgeSufficiency:.8,reasoningConfidence:.8,
  knowledgeChannels:{viability:.8,stability:.8,enrichment:.8},
  dimensions:[],nearestFailureBoundaryConstraintIds:[]
};
const base={
 identity:{sellerEntityId:'seller',offeringEntityId:'offer',targetEntityId:'target',commercialObjectiveId:'objective'},
 commercial,governingConstraintIds:['c1'],supportingEvidenceTokenIds:['e1'],decisionCriticalKnowledgeIds:['k1'],
 realityInterval:{validFrom:'2026-01-01T00:00:00Z',validTo:'2027-01-01T00:00:00Z'},referenceTime:'2026-08-11T16:00:00Z'
};
const ev=[{evidenceKey:'a',direction:'SUPPORT',effectiveStrength:.8,dependenceFamilyKey:'fam'}];
let r=m.composeTruthIntoCommercialReality({...base,knowledge:[{knowledgeId:'k1',evidence:ev,truthQualification:'KNOWN',contradictionQualified:false,presence:'PRESENT',interval:{validFrom:'2026-01-01T00:00:00Z',validTo:'2027-01-01T00:00:00Z'}}]});
ok(r.authorityMode==='SHADOW','must remain shadow');
ok(r.epistemic.assessments[0].primaryState==='KNOWN'&&r.decision.state==='ESTABLISHED','known current critical knowledge should establish surviving reality');
ok(r.knowledge[0].truth.truthProbability===null,'uncalibrated truth must not silently become probability');
r=m.composeTruthIntoCommercialReality({...base,knowledge:[{knowledgeId:'k1',evidence:ev,truthQualification:'UNCERTAIN',contradictionQualified:false,presence:'PRESENT',interval:{validFrom:'2026-01-01T00:00:00Z',validTo:'2027-01-01T00:00:00Z'}}]});
ok(r.epistemic.assessments[0].primaryState==='UNCERTAIN'&&r.decision.state==='POSSIBLE','uncertain critical knowledge should yield possible');
r=m.composeTruthIntoCommercialReality({...base,knowledge:[{knowledgeId:'k1',evidence:ev,truthQualification:'KNOWN',contradictionQualified:true,presence:'PRESENT',interval:{validFrom:'2026-01-01T00:00:00Z',validTo:'2027-01-01T00:00:00Z'}}]});
ok(r.epistemic.assessments[0].primaryState==='CONTRADICTORY'&&r.decision.state==='CONTESTED','qualified contradiction should contest');
r=m.composeTruthIntoCommercialReality({...base,knowledge:[{knowledgeId:'k1',evidence:ev,truthQualification:'KNOWN',contradictionQualified:false,presence:'PRESENT',interval:{validFrom:'2026-01-01T00:00:00Z',validTo:'2026-06-01T00:00:00Z'}}]});
ok(r.epistemic.assessments[0].primaryState==='EXPIRED'&&r.decision.state==='UNRESOLVED','expired critical knowledge cannot establish');
r=m.composeTruthIntoCommercialReality({...base,knowledge:[{knowledgeId:'k1',evidence:ev,truthQualification:'KNOWN',contradictionQualified:false,presence:'PRESENT',interval:{validFrom:'2026-12-01T00:00:00Z',validTo:'2027-06-01T00:00:00Z'}}]});
ok(r.epistemic.assessments[0].primaryState==='UNKNOWN'&&r.epistemic.assessments[0].vector.temporalValidity==='UNASSESSED','future knowledge must fail closed');
r=m.composeTruthIntoCommercialReality({...base,knowledge:[{knowledgeId:'k1',evidence:[],truthQualification:'UNKNOWN',contradictionQualified:false,presence:'MISSING',interval:{}}]});
ok(r.epistemic.assessments[0].primaryState==='MISSING'&&r.decision.state==='UNRESOLVED','missing critical knowledge blocks');
let threw=false;try{m.composeTruthIntoCommercialReality({...base,knowledge:[{knowledgeId:'k1',evidence:ev,truthQualification:'UNVERIFIED',contradictionQualified:true,presence:'PRESENT',interval:{}}]});}catch{threw=true;}ok(threw,'unverified contradiction fails closed');
threw=false;try{m.composeTruthIntoCommercialReality({...base,decisionCriticalKnowledgeIds:['missing-id'],knowledge:[{knowledgeId:'k1',evidence:ev,truthQualification:'KNOWN',contradictionQualified:false,presence:'PRESENT',interval:{}}]});}catch{threw=true;}ok(threw,'undeclared critical knowledge fails closed');
console.log(`CIE-R3 adversarial: ${pass}/10 PASS`);

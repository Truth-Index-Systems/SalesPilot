import fs from 'node:fs';
const file = fs.readFileSync('lib/genesis-t8/mathematics/explainable-reasoning.ts','utf8');
const checks = [
 ['version', file.includes('GENESIS_T8_EXPLAINABLE_REASONING_VERSION = "1.0.0"')],
 ['build', file.includes('GENESIS_T8_CE_R2_R7_BUILD = "R7-BUILD1"')],
 ['trace builder', file.includes('buildOpportunityExplanationTrace')],
 ['AI envelope', file.includes('createAIExplanationEnvelope')],
 ['explain only', file.includes('EXPLAIN_TRACE_ONLY')],
 ['viability immutable', file.includes('"VIABILITY"')],
 ['rank immutable', file.includes('"RANK"')],
 ['math immutable', file.includes('"MATHEMATICAL_VALUES"')],
 ['research immutable', file.includes('"RESEARCH_PRIORITY"')],
 ['elimination trace', file.includes('eliminatingConstraintIds')],
 ['unresolved trace', file.includes('unresolvedBoundaryConstraintIds')],
 ['nearest boundary trace', file.includes('nearestFailureBoundaryConstraintIds')],
 ['support trace', file.includes('supportingConstraintIds')],
 ['limiting trace', file.includes('limitingConstraintIds')],
 ['contradiction trace', file.includes('contradictoryConstraintIds')],
 ['unknown trace', file.includes('unknownConstraintIds')],
 ['contact trace', file.includes('contactState')],
 ['route trace', file.includes('routeState')],
 ['next research trace', file.includes('nextResearch')],
 ['token refs', file.includes('referencedTokenIds')],
 ['relationship refs', file.includes('referencedRelationshipIds')],
 ['evidence refs', file.includes('evidenceIds')],
 ['dependency refs', file.includes('incomingDependencyIds')],
 ['identity mismatch gate', file.includes('ORDER_IDENTITY_MISMATCH')],
 ['viability mismatch gate', file.includes('VIABILITY_MISMATCH')],
 ['complete constraint trace gate', file.includes('INCOMPLETE_CONSTRAINT_TRACE')],
 ['research identity gate', file.includes('RESEARCH_IDENTITY_MISMATCH')],
 ['AI cannot create conclusion law', file.includes('NEVER_CREATES_A_NEW_CONCLUSION')],
 ['narrative non-authoritative law', file.includes('NARRATIVE_LANGUAGE_IS_NON_AUTHORITATIVE')],
 ['math local export', fs.readFileSync('lib/genesis-t8/mathematics/index.ts','utf8').includes('explainable-reasoning')],
 ['spec exists', fs.existsSync('GENESIS-T8-CE-R2-R7-EXPLAINABLE-COMMERCIAL-REASONING.md')],
];
let pass=0;
for (const [name,ok] of checks){ console.log(`${ok?'PASS':'FAIL'} ${name}`); if(ok) pass++; }
console.log(`Genesis T8 CE-R2 R7 static: ${pass}/${checks.length}`);
if(pass!==checks.length) process.exit(1);

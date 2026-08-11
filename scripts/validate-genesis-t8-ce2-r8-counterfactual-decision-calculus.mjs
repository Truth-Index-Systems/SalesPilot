import fs from 'node:fs';
const p='lib/genesis-t8/ce2-evolution/counterfactual-decision-calculus.ts';
const s=fs.readFileSync(p,'utf8');
const checks=[
['file exists',fs.existsSync(p)],['version',s.includes('CE2-R8')],['conditions',s.includes('GenesisT8CounterfactualCondition')],['interventions',s.includes('GenesisT8CounterfactualIntervention')],['actionability',s.includes('ACTIONABLE')&&s.includes('INADMISSIBLE')],['reversibility',s.includes('IRREVERSIBLE')],['subset minimal',s.includes('subsetMinimal')],['pareto',s.includes('paretoEfficient')],['limits',s.includes('maxEvaluatedSubsets')],['no probability',s.includes('INTERVENTION_AUTHORITY_LEAK')],['no scalar distance',s.includes('distance')],['baseline target',s.includes('baselineSatisfiesTarget')],['fail closed candidate',s.includes('CANDIDATE_LIMIT_EXCEEDED')],['fail closed subset',s.includes('SUBSET_LIMIT_EXCEEDED')],['explicit effects',s.includes('satisfiesConditionIds')],['export',fs.readFileSync('lib/genesis-t8/ce2-evolution/index.ts','utf8').includes('./counterfactual-decision-calculus')]
];
let n=0; for(const [name,ok] of checks){if(!ok){console.error('FAIL',name);process.exitCode=1}else{console.log('PASS',name);n++}} console.log(`${n}/${checks.length} PASS`);

import fs from 'node:fs';const read=p=>fs.readFileSync(p,'utf8');
const authority=read('lib/genesis-t8/cie/contact-authority.ts'),truth=read('lib/genesis-t8/cie/contact-truth.ts'),migration=read('supabase/migrations/0156_marketroute_forensic_build6_contact_truth.sql'),worker=read('lib/genesis-t8/cie/contact-authority-worker.ts'),scheduler=read('lib/pipeline/scheduler.ts');
const checks=[
 ['R6 authoritative constant',authority.includes('GENESIS_T8_CIE_R6_AUTHORITY_MODE = "AUTHORITATIVE"')],
 ['route participation law',authority.includes('CONTACT_AUTHORITY_DERIVES_FROM_R5_OPEN_ROUTE_PARTICIPATION')],
 ['contact truth required',authority.includes('contact.contactTruth.authorityReady')],
 ['channel truth required',authority.includes('contactTruthSupportsChannel')],
 ['legacy verified counts removed',!authority.includes('verifiedIdentityEvidence')&&!authority.includes('verifiedRoleEvidence')],
 ['organizational routes allowed',authority.includes('ORGANISATIONAL_ROUTE')],
 ['no weighted comparison in R6',!authority.includes('overall_confidence')&&!authority.includes('overallConfidence')],
 ['contact truth semantics',truth.includes('MR-T8-FB6-CONTACT-TRUTH-1.0.0')],
 ['legacy verified boolean has no evaluator authority',!truth.includes('.verified')],
 ['SQL strips opportunity score',migration.includes('opportunity_score=null')],
 ['SQL READY categorical',migration.includes("status='READY'")],
 ['truth snapshot table',migration.includes('genesis_t8_contact_truth_snapshots')],
 ['live worker evaluates R5',worker.includes('evaluateCieR5RouteAuthority')],
 ['live worker evaluates contact Truth',worker.includes('evaluateContactTruth')],
 ['live worker evaluates R6',worker.includes('evaluateCieR6ContactAuthority')],
 ['scheduler invokes R6 after R4',scheduler.includes('await runCieR6ContactAuthority(runId)')],
 ['context exposes raw contact evidence',migration.includes("'truthPolarity',e.truth_polarity")],
 ['temporal invalidation enforced',migration.includes('CONTACT_TRUTH_TEMPORAL_REVALIDATION_DUE')],
];let pass=0;for(const[n,ok]of checks){console.log(`${ok?'PASS':'FAIL'} ${n}`);if(ok)pass++;}console.log(`CIE-R6 static ${pass}/${checks.length}`);if(pass!==checks.length)process.exit(1);

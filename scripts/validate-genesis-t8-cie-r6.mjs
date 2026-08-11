import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const authority=read('lib/genesis-t8/cie/contact-authority.ts');
const legacy=read('lib/contacts/deterministic-authority.ts');
const structured=read('lib/contacts/structured-output.ts');
const sql=read('supabase/migrations/0144_genesis_t8_cie_r6_contact_authority.sql');
const worker=read('lib/genesis-t8/cie/contact-authority-worker.ts');
const scheduler=read('lib/pipeline/scheduler.ts');
const checks=[
 ['R6 authoritative constant',authority.includes('GENESIS_T8_CIE_R6_AUTHORITY_MODE = "AUTHORITATIVE"')],
 ['route participation law',authority.includes('CONTACT_AUTHORITY_DERIVES_FROM_R5_OPEN_ROUTE_PARTICIPATION')],
 ['verified identity required',authority.includes('verifiedIdentityEvidence > 0')],
 ['verified role required',authority.includes('verifiedRoleEvidence > 0')],
 ['organizational routes allowed',authority.includes('ORGANISATIONAL_ROUTE')],
 ['no weighted comparison in R6',!authority.includes('overall_confidence')&&!authority.includes('overallConfidence')],
 ['legacy contacts canonical order',!legacy.includes('b.confidence.overall - a.confidence.overall')],
 ['structured contacts canonical order',!structured.includes('b.confidence.overall - a.confidence.overall')],
 ['SQL strips opportunity score',sql.includes('opportunity_score=null')],
 ['SQL READY categorical',sql.includes("status='READY'")],
 ['SQL authority table',sql.includes('cie_r6_contact_decisions')],
 ['SQL accepts null primary contact',sql.includes('p_primary_contact_id uuid')],
 ['live worker recomputes R5 route authority',worker.includes('evaluateCieR5RouteAuthority')],
 ['live worker evaluates R6 contact authority',worker.includes('evaluateCieR6ContactAuthority')],
 ['scheduler invokes R6 after R4',scheduler.includes('await runCieR6ContactAuthority(runId)')],
 ['context uses verified identity evidence',sql.includes("e.evidence_type='IDENTITY' and e.verified=true")],
 ['context uses verified role evidence',sql.includes("e.evidence_type='ROLE' and e.verified=true")],
];
let pass=0; for(const [n,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${n}`);if(ok)pass++;}
console.log(`CIE-R6 static ${pass}/${checks.length}`); if(pass!==checks.length) process.exit(1);

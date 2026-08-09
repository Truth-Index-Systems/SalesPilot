import fs from 'node:fs';
const mig=fs.readFileSync(new URL('../supabase/migrations/0134_genesis_g82_mrti2_build8_3_6_ai_governance_lease_reconciliation.sql',import.meta.url),'utf8');
const gov=fs.readFileSync(new URL('../lib/ai/governance.ts',import.meta.url),'utf8');
const checks=[
 ['lease columns',mig.includes('reservation_expires_at')&&mig.includes('reservation_heartbeat_at')],
 ['reconcile rpc',mig.includes('reconcile_ai_reservation_capacity')],
 ['pending checkpoint renews lease',mig.includes("b.status in ('queued','in_progress')")&&mig.includes("now()+interval '10 minutes'")],
 ['terminal checkpoint releases capacity',mig.includes("b.status in ('completed','failed','cancelled','incomplete')")],
 ['expired orphan fails',mig.includes('AI_RESERVATION_LEASE_EXPIRED')],
 ['active capacity no 2-hour heuristic',!mig.includes("created_at>=now()-interval '2 hours'")],
 ['organisation cap preserved',mig.includes('v_org_in_flight>=2')],
 ['campaign cap preserved',mig.includes('v_campaign_research_in_flight>=3')],
 ['reserve reconciles under lock',mig.includes("pg_advisory_xact_lock")&&mig.includes('perform public.reconcile_ai_reservation_capacity(p_organisation_id)')],
 ['new reservation receives lease',mig.includes("now()+interval '10 minutes',now()")],
 ['capacity snapshot rpc',mig.includes('ai_governance_capacity_snapshot')],
 ['service role grants',mig.includes('grant execute on function public.reconcile_ai_reservation_capacity(uuid) to service_role')],
 ['client reconciles before fast path',gov.indexOf('rpc/reconcile_ai_reservation_capacity')<gov.indexOf('ai_usage_ledger?request_key=eq.')],
 ['capacity denial telemetry',gov.includes('AI_GOVERNANCE_CAPACITY')],
 ['telemetry active counts',gov.includes('activeHeavy')&&gov.includes('organisationLimit')],
 ['job types retained',mig.includes('GENESIS_G8_REPAIR')&&mig.includes('GENESIS_G82_EXPANSION')],
];
let pass=0; for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`); if(ok) pass++;}
console.log(`\n${pass}/${checks.length} checks passed`); if(pass!==checks.length) process.exit(1);

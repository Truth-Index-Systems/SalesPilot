import fs from 'node:fs';
const migration=fs.readFileSync(new URL('../supabase/migrations/0069_genesis_g476_opportunity_readiness_freeze.sql',import.meta.url),'utf8');
const queue=fs.readFileSync(new URL('../components/opportunity-review-queue.tsx',import.meta.url),'utf8');
const page=fs.readFileSync(new URL('../app/opportunities/page.tsx',import.meta.url),'utf8');
const actions=fs.readFileSync(new URL('../components/opportunity-review-actions.tsx',import.meta.url),'utf8');
const required=[
  [migration.includes("route_research_state,'')='READY'"),'foundation readiness must use route research state'],
  [migration.includes('OPPORTUNITY_ROUTE_INTELLIGENCE_NOT_READY'),'database approval gate must exist'],
  [migration.includes("cs.route_research_state in ('PLANNING','RESEARCHING','EXPANDING')"),'active route research must remain BUILDING'],
  [queue.includes('row.status === "BUILDING"'),'BUILDING UI state must be explicit'],
  [queue.includes('rows.filter(reviewable)'),'bulk selection must be readiness-gated'],
  [page.includes('row.status === "READY" && (row.opportunity_score ?? 0) >= 80'),'recommended metrics must require READY'],
  [actions.includes('Approval unlocks when the opportunity is ready for review.'),'detail approval gate copy must exist'],
];
const failed=required.filter(([ok])=>!ok);
if(failed.length){for(const [,m] of failed)console.error('FAIL',m);process.exit(1);}console.log('G4.7.6 opportunity readiness validation passed');

import fs from 'node:fs';
const source = fs.readFileSync(new URL('../lib/pipeline/scheduler.ts', import.meta.url), 'utf8');
const checks = [
  ['hard limit', 'SCHEDULER_HARD_LIMIT_MS = 300_000'],
  ['safety reserve', 'SCHEDULER_SAFETY_RESERVE_MS = 25_000'],
  ['route budget', 'ROUTE_INTELLIGENCE_START_BUDGET_MS = 245_000'],
  ['budget helper', 'remainingSchedulerBudgetMs'],
  ['heavy-stage separation', 'Never chain a second heavyweight worker in the same invocation'],
  ['route deferral', 'deferred Route Intelligence due to execution budget'],
  ['route claim guarded', 'canStartRouteIntelligence'],
  ['engagement guard', 'ENGAGEMENT_AI_START_BUDGET_MS = 130_000'],
];
for (const [name, token] of checks) {
  if (!source.includes(token)) throw new Error(`G4.7.4 validation failed: missing ${name}`);
}
if (!source.includes('await releasePipelineSchedulerLease(runId)')) throw new Error('lease release missing');
console.log('G4.7.4 scheduler execution-budget validation passed.');

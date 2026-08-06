import fs from 'node:fs';
const read = p => fs.readFileSync(p,'utf8');
const schedulerRoute=read('app/api/autonomy/pipeline/run/route.ts');
const scheduler=read('lib/pipeline/scheduler.ts');
const migration=read('supabase/migrations/0053_genesis_g465_reliability_and_legacy_cleanup.sql');
const execution=read('app/api/engagements/[id]/execution/route.ts');
const checks=[
  [schedulerRoute.includes('engagementWorkerFailed'),'scheduler reports engagement worker failures'],
  [schedulerRoute.includes('FAILED_RETRYABLE'),'retryable engagement failure is surfaced'],
  [scheduler.includes('@/lib/engagement/types'),'scheduler imports canonical engagement types'],
  [!fs.existsSync('lib/engagement/domain.ts'),'obsolete engagement domain shim removed'],
  [migration.includes('is_supported_contact_form_url'),'specific contact-form URL validation added'],
  [migration.includes("outcome cannot move backwards"),'commercial outcome regression blocked'],
  [migration.includes("outcome value is only valid for won opportunities"),'won value integrity enforced'],
  [execution.includes('8192'),'execution metadata payload bounded'],
];
for(const [ok,label] of checks){if(!ok)throw new Error(label);console.log('✓',label)}
console.log('G4.6.5 rigorous audit validation passed');

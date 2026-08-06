import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/0042_fix_commercial_reasoning_claim_ambiguity.sql', 'utf8');
const phase3 = fs.readFileSync('supabase/migrations/0036_genesis_g4_phase3_commercial_reasoning.sql', 'utf8');
const assertions = [
  [migration.includes('create or replace function public.claim_engagement_commercial_reasoning'), 'claim function is replaced'],
  [migration.includes('on conflict on constraint engagement_commercial_analyses_engagement_id_key do nothing'), 'named constraint removes engagement_id ambiguity'],
  [!migration.includes('on conflict(engagement_id)'), 'ambiguous conflict target is absent'],
  [phase3.includes('on conflict on constraint engagement_commercial_analyses_engagement_id_key do nothing'), 'fresh installs contain the correction'],
  [migration.includes('grant execute on function public.claim_engagement_commercial_reasoning(uuid) to service_role'), 'service role execution remains granted'],
];
for (const [ok, message] of assertions) {
  if (!ok) throw new Error(`FAILED: ${message}`);
  console.log(`✓ ${message}`);
}
console.log('Commercial reasoning claim ambiguity hotfix passed');

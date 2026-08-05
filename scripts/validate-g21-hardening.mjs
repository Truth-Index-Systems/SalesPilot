import fs from 'node:fs';

const required = [
  'lib/discovery/normalise.ts',
  'components/discovery-retry-button.tsx',
  'app/api/campaigns/[id]/discovery/retry/route.ts',
  'supabase/migrations/0005_genesis_g21_discovery_hardening.sql',
];
for (const file of required) {
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
}
const migration = fs.readFileSync(required[3], 'utf8');
for (const token of ['lease_expires_at','next_attempt_at','WORKER_LEASE_EXPIRED','retry_company_discovery','security definer']) {
  if (!migration.includes(token)) throw new Error(`Migration missing ${token}`);
}
const normalise = fs.readFileSync(required[0], 'utf8');
for (const token of ['customerDomain','seen.has(domain)','officialEvidence','DISCOVERY_NO_VERIFIED_COMPANIES']) {
  if (!normalise.includes(token)) throw new Error(`Normaliser missing ${token}`);
}
const worker = fs.readFileSync('app/api/autonomy/company-discovery/run/route.ts','utf8');
if (!worker.includes('timingSafeEqual') || !worker.includes('export const POST')) throw new Error('Worker hardening missing');
console.log('Genesis G2.1 discovery hardening validation passed');

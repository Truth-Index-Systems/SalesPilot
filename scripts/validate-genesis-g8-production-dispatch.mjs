import fs from "node:fs";

const checks=[]; const add=(ok,label)=>checks.push({ok:Boolean(ok),label});
const adapterFile="lib/genesis-g8/production-dispatch.ts";
const migrationFile="supabase/migrations/0110_genesis_g81_release8_production_dispatch_adapter.sql";
const root=fs.readFileSync("lib/genesis-g8/index.ts","utf8");
add(fs.existsSync(adapterFile),`${adapterFile} exists`);
add(fs.existsSync(migrationFile),`${migrationFile} exists`);
const src=fs.readFileSync(adapterFile,"utf8");
const sql=fs.readFileSync(migrationFile,"utf8");

add(src.includes('G8.1-R8-DISPATCH-1.0'),"R8 production dispatch is versioned");
add(src.includes('dispatchGenesisG8ExecutionEnvelope'),"envelope dispatch adapter exported");
add(src.includes('GenesisG8PrivateWorkflowContext'),"private workflow context separated from shared intelligence");
for (const outcome of ["KNOWLEDGE_ACCEPTED","FULL_DISCOVERY_QUEUED","REPAIR_QUEUED","HUMAN_REVIEW_QUEUED","ALREADY_DISPATCHED","BLOCKED_MISSING_WORKFLOW"])
  add(src.includes(`\"${outcome}\"`),`dispatch outcome ${outcome} exists`);
add(src.includes('register_genesis_g8_production_dispatch'),"adapter registers every instruction idempotently");
add(src.includes('ledger.created === false') && src.includes('ALREADY_DISPATCHED'),"completed dispatch retries are idempotent");
add(src.includes('enqueue_genesis_g8_discovery_repair'),"claim-level repair uses durable repair queue");
add(src.includes('never broadens a claim repair into a full stage rerun'),"repair precision is explicitly protected");
add(src.includes('queue_genesis_g8_full_discovery_via_existing_session'),"full fallback reuses existing discovery-session authority");
add(src.includes('organisationId and campaignId are required'),"full fallback fails closed without tenant workflow identity");
add(src.includes('enqueue_genesis_g8_founder_review'),"human-review instruction routes to founder queue");
add(!src.match(/openai|responses\.create|chat\.completions/i),"R8 adapter performs no AI calls");
add(root.includes('export * from "./production-dispatch"'),"R8 public API exported from G8 root");

for (const table of ["genesis_g8_production_dispatches","genesis_g8_discovery_repair_queue","genesis_g8_founder_review_queue"])
  add(sql.includes(`public.${table}`),`${table} persistence exists`);
add(sql.includes('dispatch_key text not null unique'),"dispatch ledger has stable unique idempotency key");
add(sql.includes("status in ('QUEUED','CLAIMED','COMPLETED','FAILED','CANCELLED')"),"repair queue has explicit worker lifecycle");
add(sql.includes("status in ('OPEN','RESOLVED','CANCELLED')"),"founder review queue has explicit lifecycle");
add(sql.includes("elsif v_status in ('COMPLETED','FAILED','CANCELLED')"),"full Discovery only resets terminal sessions");
add(sql.includes('RUNNING/QUEUED sessions remain authoritative'),"existing running/queued Discovery ownership is preserved");
add(sql.includes('GENESIS_G8_CAMPAIGN_CONTEXT_MISMATCH'),"full Discovery validates organisation/campaign pairing");
add(sql.includes('GENESIS_G8_CLAIM_ENTITY_MISMATCH'),"repair dispatch validates claim/entity pairing");
add(sql.includes('enable row level security'),"R8 dispatch tables have RLS enabled");
add(sql.includes('to service_role') && sql.includes('revoke all'),"R8 dispatch mutations remain service-role only");
add(sql.includes('must not be copied into shared intelligence'),"private workflow isolation documented at persistence boundary");

const failed=checks.filter(c=>!c.ok);
for(const c of checks) console.log(`${c.ok?'PASS':'FAIL'} ${c.label}`);
if(failed.length) process.exit(1);
console.log(`\nGenesis G8.1 Production Dispatch Adapter validation passed (${checks.length}/${checks.length}).`);

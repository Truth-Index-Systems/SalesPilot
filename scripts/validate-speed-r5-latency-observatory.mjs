import fs from "node:fs";

const checks=[];
function read(p){return fs.readFileSync(p,"utf8");}
function check(name,ok){checks.push([name,Boolean(ok)]);}
const migration=read("supabase/migrations/0096_genesis_speed_r5_latency_observatory_hardening.sql");
const collector=read("lib/ai/background-collector.ts");
const governance=read("lib/ai/governance.ts");
const latency=read("lib/ai/latency-repository.ts");
const page=read("app/internal/ai-costs/page.tsx");
const background=read("lib/ai/background-response.ts");

check("lifecycle timestamps persisted",["submitted_at","provider_completed_at","collected_at","owner_woken_at","validated_at","persisted_at"].every(v=>migration.includes(v)));
check("cache tokens persisted",migration.includes("cached_input_tokens")&&governance.includes("cached_input_tokens"));
check("reasoning tokens persisted",migration.includes("reasoning_tokens")&&governance.includes("reasoning_tokens"));
check("usage parser reads provider token details",governance.includes("input_tokens_details")&&governance.includes("output_tokens_details"));
check("webhook-before-checkpoint race reconciled",migration.includes("Close the webhook-before-checkpoint race")&&migration.includes("openai_webhook_events"));
check("unmatched webhook repair exists",migration.includes("repair_ai_background_observability")&&migration.includes("matched=false"));
check("reconciled webhook race wakes owning job",migration.includes("v_response_id")&&migration.includes("wake_ai_background_owner(v_response_id)"));
check("expired collector leases repaired",migration.includes("R5_EXPIRED_COLLECTOR_LEASE_RECOVERED"));
check("orphan reservation classification exists",migration.includes("ORPHANED_RESERVATION_NO_RESPONSE_ID"));
check("collector invokes repair",collector.includes('rpc/repair_ai_background_observability'));
check("collector retrieval parallelised",collector.includes("Promise.all(claims.map"));
check("collector claim fairness is campaign-aware",migration.includes("row_number() over(partition by b.organisation_id")&&migration.includes("lane_rank"));
check("collector remains retrieval-only",!collector.includes('fetch("https://api.openai.com/v1/responses", {\n      method: "POST"'));
check("background submission remains resumable",background.includes("background: true")&&background.includes("store: true"));
check("latency repository computes p50/p90/p95",latency.includes("p50Ms")&&latency.includes("p90Ms")&&latency.includes("p95Ms")&&latency.includes("percentile"));
check("latency repository splits provider/collection timing",latency.includes("providerP50Ms")&&latency.includes("collectionP50Ms"));
check("latency repository measures cache hit",latency.includes("cacheHitRate"));
check("latency repository exposes workspace-scoped stale/recovery health",latency.includes("collectorErrors")&&latency.includes("stale")&&!latency.includes("openai_webhook_events?matched"));
check("founder UI exposes latency observatory",page.includes("R5 latency observatory")&&page.includes("Provider p50")&&page.includes("Cache hit"));
check("R5 does not change workload profiles",fs.existsSync("lib/ai/workload-profile.ts")&&!migration.includes("reasoningEffort"));
check("R5 does not alter commercial state authority",!migration.includes("engagement_commercial_analyses")&&!migration.includes("engagement_drafts"));

const failed=checks.filter(([,ok])=>!ok);
for(const [name,ok] of checks) console.log(`${ok?"PASS":"FAIL"} ${name}`);
console.log(`\nSpeed R5: ${checks.length-failed.length}/${checks.length} checks passed.`);
if(failed.length) process.exit(1);

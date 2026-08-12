import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");
const current = read("supabase/migrations/0154_marketroute_forensic_build4_legacy_route_authority_eradication.sql");

const checks = [
  ["save_route_intelligence_owned", "supabase/migrations/0068_genesis_g475_route_intelligence_ownership_fencing.sql", "returns integer"],
  ["evaluate_contact_discovery_route_readiness", "supabase/migrations/0088_genesis_post_freeze_breadth_then_depth_route_research_and_phone_presentation.sql", "returns table(action text,primary_ready boolean,fallback_ready boolean,route_count integer,expansion_pass integer)"],
  ["get_cie_r6_contact_authority_context", "supabase/migrations/0153_marketroute_forensic_build3_state_invalidation_architecture.sql", "returns table(opportunity_id uuid,reality_id text,commercial_routes jsonb,contacts jsonb,r4_authority_fingerprint text)"],
  ["invalidate_stale_cie_r6_authority", "supabase/migrations/0153_marketroute_forensic_build3_state_invalidation_architecture.sql", "returns table(invalidated integer)"],
  ["apply_cie_r6_contact_authority", "supabase/migrations/0153_marketroute_forensic_build3_state_invalidation_architecture.sql", "returns table(applied integer,ready integer,organisational integer)"],
  ["complete_g5_channel_strategy_owned", "supabase/migrations/0090_genesis_post_freeze_responsibility_boundary_prompt_pass.sql", "returns public.engagement_strategies"],
  ["run_g5_engagement_queue_builder_owned", "supabase/migrations/0084_genesis_g5_release12_autopilot_mode.sql", "returns table(inspected integer,queued integer,held integer,already_queued integer)"],
  ["claim_next_g5_email_execution_owned", "supabase/migrations/0082_genesis_g5_release9_queue_and_execution_engine.sql", "returns table(queue_id uuid,strategy_id uuid,lease_token uuid,organisation_id uuid,campaign_id uuid,recipient_address text,recipient_timezone text,subject text,body text)"],
  ["get_g5_commercial_reasoning_context_owned", "supabase/migrations/0075_genesis_g5_release2_commercial_reasoning_engine.sql", "returns table(organisation_id uuid,campaign_id uuid,context_json jsonb)"],
];

function normalise(value) { return value.replace(/\s+/g, " ").trim().toLowerCase(); }
function functionBlock(sql, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${escaped}\\s*\\([\\s\\S]*?\\)\\s*returns\\s+[\\s\\S]*?language\\s+`, "ig");
  const matches = [...sql.matchAll(re)];
  return matches.at(-1)?.[0] ?? "";
}

let passed = 0;
for (const [name, previousPath, expectedReturn] of checks) {
  const prev = read(previousPath);
  const currentBlock = normalise(functionBlock(current, name));
  const previousBlock = normalise(functionBlock(prev, name));
  const expected = normalise(expectedReturn);
  if (!currentBlock || !previousBlock || !currentBlock.includes(expected) || !previousBlock.includes(expected)) {
    throw new Error(`FORENSIC_BUILD4_SQL_SIGNATURE_FAIL:${name}`);
  }
  console.log(`PASS ${name} return contract unchanged`);
  passed += 1;
}

const drop = current.indexOf("drop function if exists public.run_g5_autopilot_approval_owned(uuid);");
const create = current.indexOf("create function public.run_g5_autopilot_approval_owned(p_scheduler_run_id uuid)");
if (drop < 0 || create < 0 || drop >= create) throw new Error("FORENSIC_BUILD4_SQL_SIGNATURE_FAIL:autopilot_drop_order");
console.log("PASS autopilot changed body is drop/recreate safe");
passed += 1;

if (!current.trimStart().startsWith("BEGIN;") || !current.trimEnd().endsWith("COMMIT;")) throw new Error("FORENSIC_BUILD4_SQL_SIGNATURE_FAIL:atomic_transaction");
console.log("PASS migration is atomic BEGIN/COMMIT");
passed += 1;

console.log(`MarketRoute Forensic Build 4 SQL signature gate: ${passed}/${passed} PASS`);

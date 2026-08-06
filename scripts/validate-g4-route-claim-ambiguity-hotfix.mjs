import fs from "node:fs";
const sql=fs.readFileSync("supabase/migrations/0059_genesis_g4_route_claim_ambiguity_hotfix.sql","utf8");
const checks=[
 ["qualified update alias",sql.includes("update public.contact_discovery_sessions as target set")],
 ["qualified expansion pass",sql.includes("target.route_expansion_pass>0")],
 ["qualified attempt count",sql.includes("target.attempt_count+1")],
 ["qualified started at",sql.includes("coalesce(target.started_at,now())")],
 ["qualified where id",sql.includes("where target.id=v_id")],
 ["return column qualified",sql.includes("s.route_expansion_pass")],
];
const failed=checks.filter(([,ok])=>!ok);
if(failed.length){console.error(failed.map(([n])=>`FAIL: ${n}`).join("\n"));process.exit(1)}
console.log("G4 route claim ambiguity hotfix validation passed");

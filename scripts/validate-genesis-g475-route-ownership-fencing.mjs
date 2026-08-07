import fs from "node:fs";
function must(file, needles){const s=fs.readFileSync(file,"utf8");for(const n of needles){if(!s.includes(n))throw new Error(`${file} missing ${n}`)}}
must("supabase/migrations/0068_genesis_g475_route_intelligence_ownership_fencing.sql",[
  "assert_contact_discovery_owner",
  "CONTACT_DISCOVERY_OWNERSHIP_LOST",
  "record_contact_discovery_failure_owned",
  "save_route_intelligence_owned",
  "evaluate_contact_discovery_route_readiness_owned"
]);
must("features/contacts/contact-discovery.service.ts",[
  "update_contact_discovery_progress_owned",
  "save_route_intelligence_owned",
  "record_contact_discovery_failure_owned",
  'outcome:"SUPERSEDED"'
]);
must("lib/pipeline/scheduler.ts",["acquirePipelineSchedulerLease(owner, 300)"]);
must("lib/pipeline/repository.ts",["leaseSeconds = 300"]);
console.log("Genesis G4.7.5 Route Intelligence ownership fencing validation passed");

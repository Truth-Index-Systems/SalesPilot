import fs from "node:fs";
const must=(p,s)=>{const x=fs.readFileSync(p,"utf8");for(const q of s)if(!x.includes(q))throw new Error(`${p} missing ${q}`)};
must("supabase/migrations/0012_genesis_g3_contact_discovery_worker.sql",["queue_contact_discovery_for_company","claim_contact_discovery","save_contact_discovery_batch","finalize_contact_discovery","fail_contact_discovery","companies_queue_contact_discovery","for update","skip locked","ContactDiscoveryCompleted"]);
must("features/contacts/contact-discovery.service.ts",["runNextContactDiscovery","discoverContacts","claim_contact_discovery","save_contact_discovery_batch","finalize_contact_discovery"]);
must("lib/contacts/openai.ts",["web_search_preview","json_schema","Never invent","ContactDiscoveryResultSchema"]);
must("lib/contacts/normalise.ts",["IDENTITY","ROLE","allowedSource","officialDomain"]);
must("app/api/autonomy/contact-discovery/run/route.ts",["CRON_SECRET","timingSafeEqual","runNextContactDiscovery"]);
must("vercel.json",["/api/autonomy/company-discovery/run","/api/autonomy/contact-discovery/run"]);
console.log("G3 Phase 2 contact discovery worker contract passed.");

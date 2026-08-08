import fs from "node:fs";
import path from "node:path";

const read = p => fs.readFileSync(p, "utf8");
const worker = read("lib/intelligence/business-analysis-worker.ts");
const openai = read("lib/intelligence/openai.ts");
const jobs = read("lib/intelligence/business-analysis-jobs.ts");
const route = read("app/api/intelligence/business-discovery/route.ts");
const guard = read("lib/security/request-guard.ts");
const migration = read("supabase/migrations/0102_marketroute_g519_business_analysis_hardening_and_legacy_audit.sql");
const founderAuth = read("lib/founder-dashboard/auth.ts");
const smtp = read("lib/engagement/smtp-transport.ts");
const scheduler = read("lib/pipeline/scheduler.ts");

const checks = [
  [worker.includes("analyseBusinessCore") && worker.includes("analyseBusinessGrowth"), "decomposed worker remains the sole Business Analysis execution path"],
  [!openai.includes("export async function analyseBusiness("), "unused monolithic Business Analysis compatibility wrapper removed"],
  [jobs.includes("export type BusinessAnalysisStage") && jobs.includes('"WEBSITE_CONNECTED"') && jobs.includes('"GROWTH_STRATEGY_RUNNING"'), "runtime stage vocabulary is typed"],
  [route.indexOf("createBusinessAnalysisJob") < route.indexOf("consumeAnonymousAnalysisAllowance"), "anonymous entitlement is committed only after durable job creation"],
  [route.includes("deleteQueuedAnonymousBusinessAnalysisJob") && jobs.includes("delete_queued_anonymous_business_analysis_job"), "rejected/orphaned anonymous startup jobs have a fenced cleanup path"],
  [guard.indexOf("PUBLIC_BUSINESS_ANALYSIS_IP_SAFETY") < guard.indexOf("consumeFingerprintLimit(visitorScope"), "IP safety rejection cannot burn a visitor entitlement"],
  [migration.includes("drop function if exists public.update_business_analysis_progress") && migration.includes("drop function if exists public.complete_business_analysis_job") && migration.includes("drop function if exists public.fail_business_analysis_job"), "superseded pre-ownership Business Analysis mutation RPCs are removed"],
  [migration.includes("organisation_id is null") && migration.includes("requested_by is null") && migration.includes("status='QUEUED'") && migration.includes("core_analysis_json is null"), "anonymous cleanup RPC cannot delete owned/in-progress/result jobs"],
  [founderAuth.includes('COOKIE_NAME = "marketroute_founder_dashboard"') && founderAuth.includes("LEGACY_COOKIE_NAME"), "founder dashboard cookie is rebranded with safe legacy-session fallback"],
  [smtp.includes("EHLO marketroute") && smtp.includes("marketroute.local") && !smtp.includes("EHLO salespilot"), "SMTP runtime identity no longer leaks the retired product name"],
  [scheduler.includes("hasSchedulerBudget(schedulerStartedAt, 45_000)") && scheduler.includes("runNextRouteIntelligence"), "legacy audit validator target matches current scheduler budget architecture"],
];

let failed = 0;
for (const [ok, label] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
  if (!ok) failed += 1;
}

const runtimeRoots = ["app", "lib", "components"];
const forbiddenRpcTokens = [
  '"rpc/update_business_analysis_progress"',
  '"rpc/complete_business_analysis_job"',
  '"rpc/fail_business_analysis_job"',
];
for (const root of runtimeRoots) {
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (/\.(ts|tsx)$/.test(entry.name)) {
        const source = read(full);
        for (const token of forbiddenRpcTokens) {
          if (source.includes(token)) {
            console.log(`FAIL: unfenced legacy Business Analysis RPC referenced by runtime: ${full} -> ${token}`);
            failed += 1;
          }
        }
      }
    }
  }
}
if (!failed) console.log("MarketRoute G5.1.9 hardening / legacy audit checks passed.");
if (failed) process.exit(1);

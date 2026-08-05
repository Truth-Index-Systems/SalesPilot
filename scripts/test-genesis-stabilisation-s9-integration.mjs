import assert from "node:assert/strict";
import { PipelineSimulator } from "./lib/stabilisation-s9-simulator.mjs";

// Initial launch creates exactly one company job.
{
  const s = new PipelineSimulator();
  s.runScheduler({ forcedCompanyOutcome: "SUCCESS" });
  assert.equal(s.jobs.filter((j) => j.type === "COMPANY_DISCOVERY").length, 1);
}

// Concurrent scheduler call cannot acquire the lock.
{
  const s = new PipelineSimulator();
  s.schedulerLocked = true;
  assert.equal(s.runScheduler().acquired, false);
  s.schedulerLocked = false;
}

// Approval creates one contact job and repeat scheduling does not duplicate it.
{
  const s = new PipelineSimulator();
  s.campaign.approvedCompanies.add("company-1");
  s.runScheduler({ forcedCompanyOutcome: "NO_RESULTS", forcedContactOutcome: "INTERRUPT" });
  s.runScheduler({ forcedCompanyOutcome: "NO_RESULTS", forcedContactOutcome: "SUCCESS" });
  assert.equal(s.jobs.filter((j) => j.type === "CONTACT_DISCOVERY" && j.scopeId === "company-1").length, 1);
}

// Interrupted jobs recover after lease expiry and progress no longer lies.
{
  const s = new PipelineSimulator();
  s.campaign.approvedCompanies.add("company-1");
  s.runScheduler({ forcedCompanyOutcome: "INTERRUPT", forcedContactOutcome: "INTERRUPT" });
  s.advance(1);
  s.runScheduler({ forcedCompanyOutcome: "SUCCESS", forcedContactOutcome: "SUCCESS" });
  assert.ok(s.metrics.recoveredLeases >= 1);
  assert.ok(s.jobs.every((j) => j.state === "RUNNING" || j.progress !== 40));
}

// No results enter cooldown and do not create timeline spam every run.
{
  const s = new PipelineSimulator();
  s.runScheduler({ forcedCompanyOutcome: "NO_RESULTS" });
  const timelineCount = s.timeline.length;
  for (let i=0;i<10;i++) { s.advance(1); s.runScheduler(); }
  assert.equal(s.timeline.length, timelineCount);
  assert.equal(s.metrics.duplicateTimelineEvents, 0);
}

// Paused/archived campaigns create no work.
for (const field of ["paused", "archived"]) {
  const s = new PipelineSimulator();
  s.campaign[field] = true;
  s.runScheduler();
  assert.equal(s.jobs.length, 0);
}

// A failed contact job does not block a later company's queued job.
{
  const s = new PipelineSimulator();
  s.campaign.companyCooldownUntil = 999999;
  s.campaign.approvedCompanies.add("company-1");
  s.runScheduler({ forcedContactOutcome: "NETWORK" });
  s.campaign.approvedCompanies.add("company-2");
  s.advance(1);
  s.runScheduler({ forcedContactOutcome: "SUCCESS" });
  const company2 = s.jobs.find((j) => j.type === "CONTACT_DISCOVERY" && j.scopeId === "company-2");
  assert.equal(company2?.state, "COMPLETED");
}

console.log("S9 integration tests passed");

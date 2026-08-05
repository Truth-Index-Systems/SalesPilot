import assert from "node:assert/strict";
import { PipelineSimulator } from "./lib/stabilisation-s9-simulator.mjs";

const cycles = Number(process.env.SALESPILOT_SOAK_CYCLES ?? 500);
const s = new PipelineSimulator({ seed: 20260805 });
for (let i=0;i<12;i++) s.campaign.approvedCompanies.add(`company-${i+1}`);

for (let i=0;i<cycles;i++) {
  if (i === 110) s.campaign.paused = true;
  if (i === 120) s.campaign.paused = false;
  if (i === 250) s.campaign.pendingCompanies = 0;
  s.runScheduler();
  s.advance(1);
}

s.assertInvariants();
assert.equal(s.metrics.duplicateActiveJobs, 0);
assert.equal(s.metrics.illegalTransitions, 0);
assert.equal(s.metrics.duplicateTimelineEvents, 0);
assert.equal(s.jobs.some((j) => j.state === "RUNNING" && j.leaseExpiresAt <= s.now), false);
assert.equal(s.jobs.some((j) => j.state !== "RUNNING" && j.progress === 40), false);

console.log(JSON.stringify({
  message: "S9 soak test passed",
  cycles,
  jobs: s.jobs.length,
  timelineEvents: s.timeline.length,
  recoveredLeases: s.metrics.recoveredLeases,
  terminalFailures: s.metrics.terminalFailures,
}, null, 2));

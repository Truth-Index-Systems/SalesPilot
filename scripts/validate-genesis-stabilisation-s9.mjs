import assert from "node:assert/strict";
import fs from "node:fs";

const required = [
  "scripts/lib/stabilisation-s9-simulator.mjs",
  "scripts/test-genesis-stabilisation-s9-unit.mjs",
  "scripts/test-genesis-stabilisation-s9-integration.mjs",
  "scripts/test-genesis-stabilisation-s9-soak.mjs",
  "docs/genesis-stabilisation/s9-automated-test-matrix.md",
];
for (const path of required) assert.ok(fs.existsSync(path), `missing ${path}`);
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
for (const name of ["stabilisation:s9-unit","stabilisation:s9-integration","stabilisation:s9-soak","stabilisation:s9-check"]) {
  assert.ok(pkg.scripts[name], `missing script ${name}`);
}
const scheduler = fs.readFileSync("lib/pipeline/scheduler.ts", "utf8");
assert.match(scheduler, /acquirePipelineSchedulerLease/);
assert.match(scheduler, /recoverPipelineJobs/);
assert.match(scheduler, /preparePipelineWork/);
assert.match(scheduler, /runNextCompanyDiscovery/);
assert.match(scheduler, /runNextContactDiscovery/);
console.log("S9 contract validation passed");

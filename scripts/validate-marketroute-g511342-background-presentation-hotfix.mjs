import fs from 'node:fs';
const page = fs.readFileSync('app/campaigns/[id]/page.tsx','utf8');
const checks = [
  ['background defer discriminator exists', page.includes('const discoveryBackgroundDeferred = discoveryQueued')],
  ['active research stages drive deferred discriminator', page.includes('"BREADTH_DISCOVERY"') && page.includes('"VERIFYING"')],
  ['background queued sessions keep active stage label', page.includes('(discoveryRunning || discoveryBackgroundDeferred) ? activeDiscoveryStageLabel')],
  ['background continuation has truthful copy', page.includes('continuing the same research pass in the background')],
  ['background progress remains visible', page.includes('(canShowProgress(discovery) || discoveryBackgroundDeferred)')],
  ['generic queued scheduled copy remains for genuine queued work', page.includes('queued: "Company research scheduled"')],
];
let failed = false;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) failed = true;
}
if (failed) process.exit(1);

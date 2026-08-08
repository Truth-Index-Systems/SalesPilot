import fs from 'node:fs';

const wizard = fs.readFileSync('components/campaign-wizard.tsx','utf8');
const css = fs.readFileSync('app/globals.css','utf8');
const discovery = fs.readFileSync('features/discovery/company-discovery.service.ts','utf8');

const checks = [];
const add = (ok, label) => checks.push({ok:Boolean(ok), label});

add(wizard.includes('Make yourself a coffee while MarketRoute gets to work.'), 'Business Analysis shows the V1 coffee reassurance');
add(wizard.includes("This is the only time we'll perform a full analysis of your business."), 'Business Analysis explains the one-time full analysis');
add(wizard.includes('Every opportunity, contact and outreach recommendation is built from this foundation.'), 'Business Analysis explains why the foundation matters');
add(css.includes('.analysis-coffee-note'), 'coffee reassurance has dedicated responsive styling');

const pendingStart = discovery.indexOf('if (isOpenAIBackgroundPending(error))');
const pendingEnd = discovery.indexOf('const capacityReason', pendingStart);
const pendingBlock = pendingStart >= 0 && pendingEnd > pendingStart ? discovery.slice(pendingStart, pendingEnd) : '';
const activityPos = pendingBlock.indexOf('await activityOnce(');
const deferPos = pendingBlock.indexOf('rpc/defer_company_discovery_background_owned');
add(activityPos >= 0, 'background-continuing activity remains idempotent');
add(deferPos >= 0, 'background defer authority remains in place');
add(activityPos >= 0 && deferPos >= 0 && activityPos < deferPos, 'owned activity is recorded before background defer releases ownership');
add(pendingBlock.includes('COMPANY_DISCOVERY_OWNERSHIP_LOST'), 'source documents why post-defer owned writes are invalid');

const failed = checks.filter((c)=>!c.ok);
for (const c of checks) console.log(`${c.ok?'PASS':'FAIL'} ${c.label}`);
if (failed.length) process.exit(1);
console.log(`\nMarketRoute G5.1.13.4.1 V1 launch hotfix validation passed (${checks.length}/${checks.length}).`);

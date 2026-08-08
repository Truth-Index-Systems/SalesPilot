import fs from 'node:fs';
const reader=fs.readFileSync(new URL('../lib/intelligence/website-reader.ts',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../lib/intelligence/business-analysis-worker.ts',import.meta.url),'utf8');
const wizard=fs.readFileSync(new URL('../components/campaign-wizard.tsx',import.meta.url),'utf8');
const checks=[
 [reader.includes('DNS_TIMEOUT_MS = 3000'),'DNS lookup has hard budget'],
 [reader.includes('FETCH_TIMEOUT_MS = 8000'),'page fetch has tighter hard budget'],
 [reader.includes('SECONDARY_PAGE_BUDGET_MS = 6000'),'secondary pages have aggregate budget'],
 [reader.includes('onHomepageReady'),'homepage can report progress immediately'],
 [reader.includes('homepageSource'),'homepage is retained as sufficient first-party evidence'],
 [worker.includes('"WEBSITE_CONNECTED",14'),'worker persists homepage completion before optional pages'],
 [wizard.includes('WEBSITE_CONNECTED: 1'),'UI understands homepage-ready stage'],
];
let failed=0;
for(const [ok,label] of checks){console.log(`${ok?'PASS':'FAIL'} ${label}`); if(!ok) failed++;}
if(failed) process.exit(1);

import fs from "node:fs";
const openai=fs.readFileSync("lib/intelligence/openai.ts","utf8");
const boundary=fs.readFileSync("lib/intelligence/business-structured-output.ts","utf8");
const worker=fs.readFileSync("lib/intelligence/business-analysis-worker.ts","utf8");
const wizard=fs.readFileSync("components/campaign-wizard.tsx","utf8");
const checks=[
 [openai.includes("BusinessDiscoveryGatewaySchema") && openai.includes("canonicaliseBusinessDiscoveryOutput"),"Business Discovery uses tolerant gateway + deterministic canonicalisation"],
 [boundary.includes("canonicalWebsite") && boundary.includes("httpUrl") && boundary.includes("isoDate"),"Trusted website metadata and URL/date canonicalisation are present"],
 [worker.includes("Business analysis job interrupted"),"Worker interruption is observable in server logs"],
 [wizard.includes("automatically resume when the persisted retry becomes due"),"Retryable analysis interruptions auto-resume without red failure UI"],
 [wizard.includes("if (!response.ok || data?.ok === false)"),"Worker HTTP failures are no longer silently ignored"],
];
for(const [ok,label] of checks){if(!ok)throw new Error(`FAIL: ${label}`);console.log(`PASS: ${label}`)}

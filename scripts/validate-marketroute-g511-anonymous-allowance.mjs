import fs from "node:fs";
const route=fs.readFileSync("app/api/intelligence/business-discovery/route.ts","utf8");
const guard=fs.readFileSync("lib/security/request-guard.ts","utf8");
const wizard=fs.readFileSync("components/campaign-wizard.tsx","utf8");
const landing=fs.readFileSync("components/public-landing.tsx","utf8");
const css=fs.readFileSync("app/globals.css","utf8");
const checks=[
  [guard.includes('MARKETROUTE_ANONYMOUS_ANALYSIS_LIMIT'),"anonymous analysis limit is deployment-configurable"],
  [guard.includes('DEFAULT_ANONYMOUS_ANALYSIS_LIMIT = 3'),"default anonymous allowance is 3"],
  [guard.includes('httpOnly')===false,"cookie flags stay at response boundary"],
  [guard.includes('timingSafeEqual')&&guard.includes('createHmac'),"anonymous visitor token is signed and verified"],
  [route.includes('httpOnly: true')&&route.includes('sameSite: "lax"'),"anonymous visitor cookie is HttpOnly and SameSite"],
  [route.includes('consumeAnonymousAnalysisAllowance'),"anonymous analysis POST is server-enforced"],
  [route.includes('export async function GET'),"allowance can be read without consuming it"],
  [wizard.includes('complimentary website')&&wizard.includes('ANALYSIS_LIMIT_REACHED'),"wizard shows allowance and sign-in handoff"],
  [landing.includes('From first customer to repeatable outbound.'),"landing growth strip copy is compact"],
  [css.includes('.public-founder-moments')&&css.includes('grid-template-columns:repeat(5'),"landing growth strip uses stable five-column layout"],
];
let failed=0;
for(const [ok,label] of checks){console.log(`${ok?'PASS':'FAIL'} ${label}`);if(!ok)failed++;}
if(failed)process.exit(1);

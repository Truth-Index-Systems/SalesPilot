import fs from "node:fs";
const gateway=fs.readFileSync("lib/ai/structured-response-gateway.ts","utf8");
for(const token of ["parseStructuredAiResponse","closeTruncatedJson","requestRepair","INVALID_SCHEMA","safeStructuredAiError"]) if(!gateway.includes(token)) throw new Error(`Gateway missing ${token}`);
const stages=[
 "lib/intelligence/openai.ts","lib/discovery/openai.ts","lib/contacts/openai.ts",
 "lib/engagement/commercial-reasoning-openai.ts","lib/engagement/outreach-generation-openai.ts","lib/engagement/self-review-openai.ts"
];
for(const file of stages){const text=fs.readFileSync(file,"utf8");if(!text.includes("parseStructuredAiResponse"))throw new Error(`${file} does not use gateway`);if(/JSON\.parse\s*\(\s*(?:outputText|extractOutputText)/.test(text))throw new Error(`${file} still parses model JSON directly`);}
const worker=fs.readFileSync("lib/intelligence/business-analysis-worker.ts","utf8");
if(worker.includes('message:"Unterminated')) throw new Error("Raw parser detail exposed");
console.log("Structured AI gateway validation passed");

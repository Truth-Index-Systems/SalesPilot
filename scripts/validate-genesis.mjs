import fs from "node:fs"; import path from "node:path";
const root=process.cwd(); const must=["app/page.tsx","app/campaigns/new/page.tsx","components/campaign-wizard.tsx","lib/ai/contracts.ts","lib/ai/schemas/business-dna.ts","lib/ai/schemas/proposal.ts","lib/autonomy/policy.ts","lib/events/domain-events.ts","lib/engine/ports.ts","docs/OLD-ENGINE-MERGE-MAP.md","lib/presentation/outcomes.ts","docs/PRODUCT-LANGUAGE.md"];
for(const f of must){if(!fs.existsSync(path.join(root,f))) throw new Error(`Missing ${f}`)}
const all=must.map(f=>fs.readFileSync(path.join(root,f),"utf8")).join("\n");
for(const token of ["schemaVersion","confidence","evidence","CampaignLaunched","AUTO_EXECUTE","BusinessDiscoveryAgent"]){if(!all.includes(token)) throw new Error(`Missing foundation token: ${token}`)}
const pages=fs.readdirSync(path.join(root,"app")); if(pages.includes("qualification")||pages.includes("evidence")||pages.includes("workflows")) throw new Error("Internal engine modules leaked into primary route structure");
console.log("SalesPilot Genesis validation passed.");

import fs from "node:fs";
function text(path){return fs.readFileSync(path,"utf8")}
const openai=text("lib/contacts/openai.ts");
const canonical=text("lib/contacts/structured-output.ts");
const page=text("app/opportunities/[id]/page.tsx");
const migration=text("supabase/migrations/0063_genesis_g4_contact_and_opportunity_reliability.sql");
for(const token of ["ContactDiscoveryGatewaySchema","canonicaliseContactDiscoveryOutput"]) if(!openai.includes(token)) throw new Error(`contact OpenAI missing ${token}`);
for(const token of ["expectedCompanyId","ContactDiscoveryResultSchema.parse","invalid-channel removal"]) if(!canonical.includes(token)) throw new Error(`canonical contact output missing ${token}`);
for(const token of ["company_evidence","contact_evidence","opportunity_detail"]) if(!migration.includes(token)) throw new Error(`opportunity migration missing ${token}`);
for(const token of ["const companyEvidence = Array.isArray","const contactEvidence = Array.isArray","const history = Array.isArray"]) if(!page.includes(token)) throw new Error(`opportunity page guard missing ${token}`);
console.log("G4 contact/opportunity reliability validation passed");

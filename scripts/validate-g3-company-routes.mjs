import fs from "node:fs";
const files = {
  migration: "supabase/migrations/0019_genesis_g3_company_contact_routes_memory.sql",
  schema: "lib/contacts/schemas.ts",
  openai: "lib/contacts/openai.ts",
  normalise: "lib/contacts/normalise.ts",
  service: "features/contacts/contact-discovery.service.ts",
  page: "app/contacts/page.tsx",
};
for (const [name,path] of Object.entries(files)) if (!fs.existsSync(path)) throw new Error(`Missing ${name}: ${path}`);
const migration=fs.readFileSync(files.migration,"utf8");
for (const token of ["company_contact_channels","organisation_intelligence_memory","contact_referrals","save_company_contact_channels","apply_contact_referral","PUBLIC_VERIFIED","INTERNAL_CONFIRMED"]) if(!migration.includes(token)) throw new Error(`Migration missing ${token}`);
const schema=fs.readFileSync(files.schema,"utf8");
if(!schema.includes('contact-discovery/v3')||!schema.includes('CompanyContactChannelSchema')) throw new Error("Contact v3 schema missing");
const openai=fs.readFileSync(files.openai,"utf8");
if(!openai.includes('companyContactChannels')||!openai.includes('Never manufacture an address')) throw new Error("Route research prompt missing");
const service=fs.readFileSync(files.service,"utf8");
if(!service.includes('rpc/save_company_contact_channels')) throw new Error("Worker route persistence missing");
const page=fs.readFileSync(files.page,"utf8");
if(!page.includes('Best routes into each business')) throw new Error("Contact route UI missing");
console.log("G3 company contact routes and memory validation passed.");

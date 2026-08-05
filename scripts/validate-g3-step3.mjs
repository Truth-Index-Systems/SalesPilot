import fs from "node:fs";
const required=["app/contacts/page.tsx","app/contacts/[id]/page.tsx","components/contact-review-queue.tsx","components/contact-review-actions.tsx","app/api/contacts/review-bulk/route.ts","app/api/contacts/[id]/review/route.ts","supabase/migrations/0013_genesis_g3_contact_review_ui.sql"];
for(const file of required) if(!fs.existsSync(file)) throw new Error(`Missing ${file}`);
const shell=fs.readFileSync("components/shell.tsx","utf8"); if(!shell.includes('["/contacts", "Contacts"')) throw new Error("Contacts navigation missing");
const page=fs.readFileSync("app/contacts/page.tsx","utf8"); for(const token of ["Autonomous contact discovery","Awaiting review","Ready for outreach","ContactReviewQueue"]) if(!page.includes(token)) throw new Error(`Contacts page missing ${token}`);
const migration=fs.readFileSync("supabase/migrations/0013_genesis_g3_contact_review_ui.sql","utf8"); for(const token of ["review_salespilot_contact_scoped","bulk_review_salespilot_contacts_scoped","CONTACT_REVIEWED","ContactHeld"]) if(!migration.includes(token)) throw new Error(`Migration missing ${token}`);
console.log("G3 Step 3 contact review UI contract passed.");

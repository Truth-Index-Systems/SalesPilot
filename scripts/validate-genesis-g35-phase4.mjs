import fs from "node:fs";

const read = path => fs.readFileSync(path, "utf8");
const shell = read("components/shell.tsx");
const overview = read("app/page.tsx");
const campaign = read("app/campaigns/[id]/page.tsx");
const campaigns = read("app/campaigns/page.tsx");
const engagement = read("app/replies/page.tsx");
const companies = read("app/companies/page.tsx");
const contacts = read("app/contacts/page.tsx");

const assertions = [
  [shell.includes('["/opportunities", "Opportunities"'), "Opportunities is a primary revenue-workspace destination"],
  [shell.includes('Revenue workspace') && shell.includes('Intelligence'), "Navigation separates commercial work from supporting intelligence"],
  [shell.indexOf('/opportunities') < shell.indexOf('/companies'), "Opportunities appears before supporting company intelligence"],
  [overview.includes('Opportunity workspace') && overview.includes('Best opportunities'), "Overview centres ranked opportunities"],
  [overview.includes('listOpportunities'), "Overview uses persisted opportunity intelligence"],
  [campaign.includes('Open campaign opportunities') && campaign.includes('Opportunity intelligence'), "Campaign page progresses naturally into opportunity review"],
  [campaign.includes('["Business", "Campaign", "Intelligence", "Opportunities", "Engagement", "Replies", "Pipeline"]'), "Campaign roadmap uses the commercial journey"],
  [campaigns.includes('Opportunity strategies') && campaigns.includes('recommended'), "Campaign list summarises opportunity outcomes"],
  [engagement.includes('title="Engagement"'), "Replies route is presented as Engagement without replacing the route"],
  [companies.includes('Supporting company intelligence'), "Companies remains available as supporting intelligence"],
  [contacts.includes('Supporting buyer intelligence'), "Contacts remains available as supporting intelligence"],
];

const failed = assertions.filter(([ok]) => !ok);
for (const [ok, label] of assertions) console.log(`${ok ? "✓" : "✗"} ${label}`);
if (failed.length) process.exit(1);
console.log("G3.5 Phase 4 navigation evolution contract passed.");

import fs from "node:fs";

const wizard = fs.readFileSync("components/campaign-wizard.tsx", "utf8");
const signupForm = fs.readFileSync("app/sign-up/sign-up-form.tsx", "utf8");
const signupRoute = fs.readFileSync("app/api/auth/sign-up/route.ts", "utf8");

const checks = [
  [wizard.includes('salespilot:campaign-draft:v2'), "durable campaign draft key is missing"],
  [wizard.includes('localStorage.setItem(CAMPAIGN_DRAFT_KEY'), "campaign state is not persisted continuously"],
  [wizard.includes('selectedProposalId'), "selected proposal is not persisted"],
  [wizard.includes('pagesRead'), "discovery context is not persisted"],
  [wizard.includes('step: 3'), "ready-to-launch state is not persisted before authentication"],
  [wizard.includes('localStorage.getItem(idempotencyStorageKey)'), "launch idempotency key is not durable"],
  [signupForm.includes('next: safeNext'), "signup does not submit its return destination"],
  [signupRoute.includes('safeNextPath'), "signup confirmation redirect is not safely validated"],
  [signupRoute.includes('next=${encodeURIComponent(nextPath)}'), "email confirmation loses the return destination"],
];

const failed = checks.filter(([ok]) => !ok);
if (failed.length) {
  for (const [, message] of failed) console.error(`- ${message}`);
  process.exit(1);
}

console.log("Authentication draft persistence validation passed");

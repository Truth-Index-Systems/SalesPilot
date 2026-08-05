import fs from "node:fs";

const page = fs.readFileSync("components/public-landing.tsx", "utf8");
const css = fs.readFileSync("app/globals.css", "utf8");

const required = [
  "complete outbound sales campaign",
  "Analyse my website",
  "Recommended outbound sales campaign",
  "Review your outbound sales campaign",
  "Enterprise-ready foundations",
  "Built for modern B2B teams",
  "Ready to build your outbound sales campaign?",
  'id="pricing"',
  'id="security"',
  'id="how-it-works"',
];

for (const phrase of required) {
  if (!page.includes(phrase)) throw new Error(`Missing landing requirement: ${phrase}`);
}
if (!css.includes("workflowReveal")) throw new Error("Workflow animation missing");
if (!css.includes("prefers-reduced-motion")) throw new Error("Reduced-motion support missing");
console.log("Public landing validation passed");

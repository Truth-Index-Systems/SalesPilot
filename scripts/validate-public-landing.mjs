import fs from "node:fs";

const page = fs.readFileSync("components/public-landing.tsx", "utf8");
const css = fs.readFileSync("app/globals.css", "utf8");

const required = [
  "Built for startups and founder-led sales",
  "Find your next customers without building a sales team first.",
  "Find my next customers",
  "From website to opportunity",
  "You know your product. MarketRoute helps you find who should buy it.",
  "Less prospecting admin. More time speaking to customers.",
  "Built to earn trust",
  "Opportunity Packs",
  'id="pricing"',
  'id="security"',
  'id="how-it-works"',
  '/marketroute-logo.png',
];

for (const phrase of required) {
  if (!page.includes(phrase)) throw new Error(`Missing MarketRoute landing requirement: ${phrase}`);
}
if (!css.includes("workflowReveal")) throw new Error("Workflow animation missing");
if (!css.includes("prefers-reduced-motion")) throw new Error("Reduced-motion support missing");
if (!css.includes("marketroute-wordmark")) throw new Error("MarketRoute brand treatment missing");
console.log("MarketRoute public landing validation passed");

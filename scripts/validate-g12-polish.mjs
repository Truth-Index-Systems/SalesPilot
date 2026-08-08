import fs from "node:fs";
const detail = fs.readFileSync("app/campaigns/[id]/page.tsx", "utf8");
const shell = fs.readFileSync("components/shell.tsx", "utf8");
const css = fs.readFileSync("app/globals.css", "utf8");
const required = ["Your outbound sales campaign is ready", "Company Discovery", "Why MarketRoute recommended this strategy", "Campaign timeline", "campaign-roadmap", "workspaceStats"];
for (const token of required) {
  if (!(detail + shell + css).includes(token)) throw new Error(`Missing G1.2 polish token: ${token}`);
}
console.log("Genesis G1.2 premium UX validation passed");

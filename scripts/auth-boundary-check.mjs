import fs from "node:fs";

const checks = [
  ["app/page.tsx", "<PublicLanding />"],
  ["app/page.tsx", "getCurrentUser"],
  ["components/shell.tsx", "user: MarketRouteUser | null"],
  ["components/account-menu.tsx", "router.replace(\"/\")"],
  ["app/campaigns/new/page.tsx", "getCurrentUser"],
  ["app/campaigns/page.tsx", "requirePageUser"],
  ["lib/auth/current-user.ts", "/auth/v1/user"],
];

for (const [file, expected] of checks) {
  const content = fs.readFileSync(file, "utf8");
  if (!content.includes(expected)) {
    throw new Error(`${file} is missing expected authentication-boundary behaviour: ${expected}`);
  }
}

console.log("Authentication boundary validation passed");

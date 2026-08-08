import fs from "node:fs";

const checks = [];
const add = (ok, label) => checks.push({ ok: Boolean(ok), label });
const contractsPath = "lib/genesis-g8/contracts.ts";
add(fs.existsSync(contractsPath), `${contractsPath} exists`);
const contracts = fs.readFileSync(contractsPath, "utf8");
const root = fs.readFileSync("lib/genesis-g8/index.ts", "utf8");

for (const entity of ["INDUSTRY", "SECTOR", "COMPANY", "CONTACT", "ROUTE", "OPPORTUNITY"]) {
  add(contracts.includes(`export const ${entity}_INTELLIGENCE_CONTRACT`), `${entity.toLowerCase()} contract exists`);
}
add(contracts.includes('version: "MR-CONTRACTS-1.0"'), "contract schema is explicitly versioned");
add(contracts.includes('"CRITICAL"') && contracts.includes('"REQUIRED"') && contracts.includes('"SUPPORTING"'), "claim criticality tiers are represented");
add(contracts.includes("freshnessHalfLifeDays"), "freshness policy is defined at claim-contract level");
add(contracts.includes("minimumEvidence"), "minimum evidence expectations are contract data");
add(contracts.includes("countsTowardCoverage"), "coverage eligibility is contract data");
add(contracts.includes("materialiseContractClaims"), "contracts can be materialised into Truth Kernel claims");
add(contracts.includes("getIntelligenceContract"), "contracts have one canonical lookup boundary");
add(root.includes('export * from "./contracts"'), "contracts are exported through Genesis G8 root");
add(!contracts.match(/openai|fetch\(|databaseRequest|postgres|supabase/i), "contracts contain no AI/network/database dependency");

const productionRoots = ["lib/discovery", "lib/contacts", "lib/opportunities", "lib/pipeline", "lib/autonomy"];
const productionFiles = [];
for (const rootPath of productionRoots) {
  if (!fs.existsSync(rootPath)) continue;
  const stack = [rootPath];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const next = `${current}/${entry.name}`;
      if (entry.isDirectory()) stack.push(next);
      else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) productionFiles.push(next);
    }
  }
}
const liveImportsG8 = productionFiles.some((file) => fs.readFileSync(file, "utf8").includes("genesis-g8"));
add(!liveImportsG8, "G8.1 R2 remains isolated from frozen live production paths");

const failed = checks.filter((check) => !check.ok);
for (const check of checks) console.log(`${check.ok ? "PASS" : "FAIL"} ${check.label}`);
if (failed.length) process.exit(1);
console.log(`\nGenesis G8.1 Intelligence Contracts validation passed (${checks.length}/${checks.length}).`);

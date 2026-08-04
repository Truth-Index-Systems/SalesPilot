import fs from "node:fs";
const required = [
  "app/api/intelligence/business-discovery/route.ts",
  "lib/intelligence/openai.ts",
  "lib/intelligence/model-router.ts",
  "lib/intelligence/website-reader.ts",
  "lib/intelligence/business-discovery-schema.ts",
  "lib/ai/schemas/business-dna.ts",
];
for (const file of required) {
  if (!fs.existsSync(file)) throw new Error(`Missing intelligence file: ${file}`);
}
const wizard = fs.readFileSync("components/campaign-wizard.tsx", "utf8");
if (!wizard.includes('/api/intelligence/business-discovery')) throw new Error("Campaign wizard is not connected to SalesPilot Intelligence.");
const provider = fs.readFileSync("lib/intelligence/openai.ts", "utf8");
for (const marker of ["json_schema", "BusinessDnaPayloadSchema", "OPENAI_API_KEY", "resolveOpenAIModel"]) {
  if (!provider.includes(marker)) throw new Error(`Missing provider safeguard: ${marker}`);
}
console.log("SalesPilot Intelligence validation passed.");

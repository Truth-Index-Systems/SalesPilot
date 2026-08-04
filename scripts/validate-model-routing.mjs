import fs from "node:fs";

const routerPath = "lib/intelligence/model-router.ts";
if (!fs.existsSync(routerPath)) throw new Error("Missing model router.");

const router = fs.readFileSync(routerPath, "utf8");
for (const marker of [
  "OPENAI_MODEL_STRATEGY",
  "OPENAI_MODEL_ANALYSIS",
  "OPENAI_MODEL_EMAILS",
  "OPENAI_MODEL_REPLIES",
  "OPENAI_MODEL_SUMMARIES",
  "OPENAI_MODEL_DEFAULT",
  "resolveOpenAIModel",
]) {
  if (!router.includes(marker)) throw new Error(`Missing model-routing marker: ${marker}`);
}

const provider = fs.readFileSync("lib/intelligence/openai.ts", "utf8");
if (!provider.includes('resolveOpenAIModel("strategy")')) {
  throw new Error("Business discovery is not routed through the strategy model.");
}

const env = fs.readFileSync(".env.example", "utf8");
for (const marker of [
  "OPENAI_MODEL_DEFAULT=",
  "OPENAI_MODEL_STRATEGY=",
  "OPENAI_MODEL_ANALYSIS=",
  "OPENAI_MODEL_EMAILS=",
  "OPENAI_MODEL_REPLIES=",
  "OPENAI_MODEL_SUMMARIES=",
]) {
  if (!env.includes(marker)) throw new Error(`Missing environment example: ${marker}`);
}

console.log("SalesPilot model routing validation passed.");

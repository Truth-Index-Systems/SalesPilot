import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const expansionPath = path.join(root,"lib/genesis-g8/autonomous-expansion-openai.ts");
const repairPath = path.join(root,"lib/genesis-g8/truth-v2/ai/repair-contract.ts");
const repairOpenAiPath = path.join(root,"lib/genesis-g8/discovery-repair-openai-v2.ts");
const evidenceContractPath = path.join(root,"lib/genesis-g8/truth-v2/ai/evidence-contract.ts");
const guardPath = path.join(root,"lib/ai/strict-json-schema.ts");
const expansion = fs.readFileSync(expansionPath,"utf8");
const repair = fs.readFileSync(repairPath,"utf8");
const repairOpenAi = fs.readFileSync(repairOpenAiPath,"utf8");
const evidenceContract = fs.readFileSync(evidenceContractPath,"utf8");
const guard = fs.readFileSync(guardPath,"utf8");

const checks = [];
function check(name, condition){ checks.push([name, Boolean(condition)]); }

const expansionEvidenceFields = [
  "claimKey","sourceClass","sourceUrl","sourceTitle","excerpt","directness","authority","traceability","direction",
  "sourcePublishedAt","sourceLineageKey","derivativeOfLineageKey","derivativeDepth",
];
const expansionRequired = `required: [${expansionEvidenceFields.map(v=>`\"${v}\"`).join(",")}]`;
check("expansion strict evidence requires every declared field", expansion.includes(expansionRequired));
check("expansion uses nullable published date", expansion.includes('sourcePublishedAt: { type: ["string","null"] }'));
check("expansion uses nullable derivative parent", expansion.includes('derivativeOfLineageKey: { type: ["string","null"] }'));
const evidenceSchemaBlock = expansion.match(/const EvidenceSchema = z\.object\(\{([\s\S]*?)\n\}\);/)?.[1] ?? "";
check("expansion Zod evidence has no optional primitive", !evidenceSchemaBlock.includes(".optional()"));
check("expansion Zod published date is required nullable", evidenceSchemaBlock.includes('sourcePublishedAt: z.string().datetime({offset:true}).nullable()'));
check("expansion Zod derivative parent is required nullable", evidenceSchemaBlock.includes('derivativeOfLineageKey: z.string().min(1).max(240).nullable()'));
check("expansion runtime strict-schema guard installed", expansion.includes('assertOpenAiStrictJsonSchema(expansionJsonSchema, "genesis_g82_expansion_v1")'));
check("expansion request remains strict", expansion.includes('strict:true,schema:expansionJsonSchema'));
check("expansion schema version current", expansion.includes('B8.3.3-BREADTH-DECOMPOSED-3.0'));

const repairObservationRequired = ["claimKey","direction","proposition","evidenceText","sourceUrl","sourceTitle","sourceClass","authority","directness","traceability","sourcePublishedAt","observedAt","sourceLineageKey","derivativeOfLineageKey","derivativeDepth","relationshipHints"];
check("repair strict observation requires every field", repair.includes(`required:[${repairObservationRequired.map(v=>`\"${v}\"`).join(",")}]`));
check("repair nullable sourcePublishedAt", repair.includes('sourcePublishedAt:{type:["string","null"]}'));
check("repair provider schema avoids unsupported uri format", !repair.includes('format:"uri"'));
check("repair provider schema leaves URL validation to Zod", repair.includes('sourceUrl:{type:"string"}') && evidenceContract.includes('sourceUrl: z.string().url()'));
check("repair nullable derivative parent", repair.includes('derivativeOfLineageKey:{type:["string","null"]'));
check("repair relationship hint requires every field", repair.includes('required:["type","targetClaimKey","strength","rationale"]'));
check("repair runtime strict-schema guard installed", repair.includes('assertOpenAiStrictJsonSchema(mrTi2ClaimRepairJsonSchema, "mr_ti_2_claim_repair_v1")'));
check("repair request remains strict", repairOpenAi.includes('strict:true,schema:mrTi2ClaimRepairJsonSchema'));
check("repair request version bumped", repairOpenAi.includes('B8.3.1-REPAIR-STRICT-SCHEMA-1.1'));
check("repair prompt policy bumped", repair.includes('claim-repair/1.1-strict-schema'));

check("guard rejects optional object properties", guard.includes('OPENAI_STRICT_SCHEMA_OPTIONAL_PROPERTY'));
check("guard rejects additionalProperties leakage", guard.includes('OPENAI_STRICT_SCHEMA_ADDITIONAL_PROPERTIES'));
check("guard validates nested arrays", guard.includes('if (value.items) visit(value.items'));
check("guard validates schema definitions", guard.includes('value.$defs'));
check("guard rejects undocumented string formats", guard.includes('OPENAI_STRICT_SCHEMA_UNSUPPORTED_FORMAT'));
check("guard rejects unsupported composition keywords", guard.includes('OPENAI_STRICT_SCHEMA_UNSUPPORTED_KEYWORD'));

const failed = checks.filter(([,ok])=>!ok);
for(const [name,ok] of checks) console.log(`${ok?"PASS":"FAIL"} ${name}`);
console.log(`\n${checks.length-failed.length}/${checks.length} checks passed.`);
if(failed.length) process.exit(1);

import "server-only";
import type { ZodTypeAny, output as ZodOutput } from "zod";


export class StructuredAiOutputError extends Error {
  readonly code: "EMPTY" | "INVALID_JSON" | "INVALID_SCHEMA" | "REPAIR_FAILED";
  readonly safeMessage: string;
  constructor(code: StructuredAiOutputError["code"], detail?: string) {
    super(`STRUCTURED_AI_OUTPUT_${code}${detail ? `:${detail}` : ""}`);
    this.name = "StructuredAiOutputError";
    this.code = code;
    this.safeMessage = "MarketRoute received an incomplete structured response. The stage will retry automatically.";
  }
}

export function extractStructuredOutputText(value: unknown): string {
  const data = value as { output_text?: unknown; output?: Array<{ content?: Array<{ text?: unknown }> }> };
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text.trim();
  for (const item of data?.output ?? []) {
    for (const part of item.content ?? []) {
      if (typeof part.text === "string" && part.text.trim()) return part.text.trim();
    }
  }
  throw new StructuredAiOutputError("EMPTY");
}

function stripFences(raw: string): string {
  return raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function objectSlice(raw: string): string {
  const firstObject = raw.indexOf("{");
  const firstArray = raw.indexOf("[");
  const start = firstObject < 0 ? firstArray : firstArray < 0 ? firstObject : Math.min(firstObject, firstArray);
  if (start < 0) return raw;
  return raw.slice(start);
}

/** Repairs only mechanical truncation: unterminated string and unclosed JSON containers. */
function closeTruncatedJson(raw: string): string {
  const source = objectSlice(stripFences(raw)).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ");
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (const char of source) {
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") stack.push("}");
    else if (char === "[") stack.push("]");
    else if ((char === "}" || char === "]") && stack[stack.length - 1] === char) stack.pop();
  }
  let repaired = source.replace(/[,\s:]+$/, "");
  if (inString) repaired += '"';
  while (stack.length) repaired += stack.pop();
  return repaired;
}

function parseCandidate<S extends ZodTypeAny>(candidate: string, schema: S): ZodOutput<S> {
  return schema.parse(JSON.parse(candidate)) as ZodOutput<S>;
}


export async function parseStructuredAiResponse<S extends ZodTypeAny>(params: {
  response: unknown;
  schema: S;
  jsonSchema: unknown;
  schemaName: string;
  apiKey: string;
  model: string;
}): Promise<{ value: ZodOutput<S>; recovery: "NONE" | "DETERMINISTIC" }> {
  const raw = extractStructuredOutputText(params.response);
  const candidates = [stripFences(raw), closeTruncatedJson(raw)];
  let parsedJson = false;
  for (let index = 0; index < candidates.length; index += 1) {
    try {
      const recovery = index === 0 ? "NONE" : "DETERMINISTIC" as const;
      if (recovery !== "NONE") console.info("Structured AI response recovered", { schemaName: params.schemaName, recovery });
      return { value: parseCandidate(candidates[index], params.schema), recovery };
    } catch (error) {
      if (!(error instanceof SyntaxError)) parsedJson = true;
    }
  }
  throw new StructuredAiOutputError(parsedJson ? "INVALID_SCHEMA" : "INVALID_JSON");
}

export function safeStructuredAiError(error: unknown): { code: string; message: string } {
  if (error instanceof StructuredAiOutputError) return { code: error.code, message: error.safeMessage };
  return { code: "INVALID_STRUCTURED_OUTPUT", message: "MarketRoute received an invalid structured response. The stage will retry automatically." };
}

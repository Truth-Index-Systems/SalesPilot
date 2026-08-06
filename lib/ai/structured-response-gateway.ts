import "server-only";
import type { ZodType } from "zod";

const ENDPOINT = "https://api.openai.com/v1/responses";

export class StructuredAiOutputError extends Error {
  readonly code: "EMPTY" | "INVALID_JSON" | "INVALID_SCHEMA" | "REPAIR_FAILED";
  readonly safeMessage: string;
  constructor(code: StructuredAiOutputError["code"], detail?: string) {
    super(`STRUCTURED_AI_OUTPUT_${code}${detail ? `:${detail}` : ""}`);
    this.name = "StructuredAiOutputError";
    this.code = code;
    this.safeMessage = "SalesPilot received an incomplete structured response. The stage will retry automatically.";
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

function parseCandidate<T>(candidate: string, schema: ZodType<T>): T {
  return schema.parse(JSON.parse(candidate));
}

async function requestRepair<T>(params: {
  raw: string;
  schema: ZodType<T>;
  jsonSchema: unknown;
  schemaName: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
}): Promise<T> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(params.timeoutMs ?? 60_000),
    headers: { Authorization: `Bearer ${params.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: params.model,
      instructions: [
        "You repair malformed or truncated JSON for a production system.",
        "Preserve every recoverable value from the supplied response.",
        "Do not add facts, guesses, explanations or markdown.",
        "Return one object matching the required schema exactly.",
      ].join(" "),
      input: params.raw.slice(0, 30_000),
      text: { format: { type: "json_schema", name: `${params.schemaName}_repair`, strict: true, schema: params.jsonSchema } },
      max_output_tokens: 9_000,
      store: false,
    }),
  });
  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new StructuredAiOutputError("REPAIR_FAILED", `HTTP_${response.status}`);
  return parseCandidate(extractStructuredOutputText(json), params.schema);
}

export async function parseStructuredAiResponse<T>(params: {
  response: unknown;
  schema: ZodType<T>;
  jsonSchema: unknown;
  schemaName: string;
  apiKey: string;
  model: string;
  allowRepair?: boolean;
}): Promise<{ value: T; recovery: "NONE" | "DETERMINISTIC" | "MODEL_REPAIR" }> {
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
  if (params.allowRepair !== false) {
    try {
      const value = await requestRepair(params);
      console.info("Structured AI response recovered", { schemaName: params.schemaName, recovery: "MODEL_REPAIR" });
      return { value, recovery: "MODEL_REPAIR" };
    } catch (repairError) {
      console.warn("Structured AI response repair failed", {
        schemaName: params.schemaName,
        code: repairError instanceof StructuredAiOutputError ? repairError.code : "REPAIR_REQUEST_FAILED",
      });
      // The caller's stage-local retry/dead-letter policy remains authoritative.
    }
  }
  throw new StructuredAiOutputError(parsedJson ? "INVALID_SCHEMA" : "INVALID_JSON");
}

export function safeStructuredAiError(error: unknown): { code: string; message: string } {
  if (error instanceof StructuredAiOutputError) return { code: error.code, message: error.safeMessage };
  return { code: "INVALID_STRUCTURED_OUTPUT", message: "SalesPilot received an invalid structured response. The stage will retry automatically." };
}

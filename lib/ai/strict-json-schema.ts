/**
 * Runtime guard for OpenAI Structured Outputs schemas used with strict:true.
 * Every declared object property must be present in `required`; nullable union
 * types model semantic optionality. This fails before network I/O so schema
 * regressions cannot become opaque provider HTTP 400s.
 */
export function assertOpenAiStrictJsonSchema(schema: unknown, schemaName = "structured_output"): void {
  const seen = new Set<unknown>();

  function visit(node: unknown, path: string): void {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    const value = node as Record<string, unknown>;

    const unsupportedComposition = ["allOf", "not", "dependentRequired", "dependentSchemas", "if", "then", "else"].find((key) => key in value);
    if (unsupportedComposition) {
      throw new Error(`OPENAI_STRICT_SCHEMA_UNSUPPORTED_KEYWORD:${schemaName}:${path}:${unsupportedComposition}`);
    }
    if (typeof value.format === "string" && !new Set(["date-time","time","date","duration","email","hostname","ipv4","ipv6","uuid"]).has(value.format)) {
      throw new Error(`OPENAI_STRICT_SCHEMA_UNSUPPORTED_FORMAT:${schemaName}:${path}:${value.format}`);
    }

    const rawType = value.type;
    const types = Array.isArray(rawType) ? rawType : rawType == null ? [] : [rawType];
    const isObject = types.includes("object") || (value.properties && typeof value.properties === "object");

    if (isObject) {
      const properties = (value.properties && typeof value.properties === "object")
        ? value.properties as Record<string, unknown>
        : {};
      const propertyKeys = Object.keys(properties);
      const required = Array.isArray(value.required) ? value.required.filter((item): item is string => typeof item === "string") : [];
      const requiredSet = new Set(required);

      if (value.additionalProperties !== false) {
        throw new Error(`OPENAI_STRICT_SCHEMA_ADDITIONAL_PROPERTIES:${schemaName}:${path}`);
      }
      for (const key of propertyKeys) {
        if (!requiredSet.has(key)) {
          throw new Error(`OPENAI_STRICT_SCHEMA_OPTIONAL_PROPERTY:${schemaName}:${path}.${key}`);
        }
      }
      for (const key of required) {
        if (!(key in properties)) {
          throw new Error(`OPENAI_STRICT_SCHEMA_UNKNOWN_REQUIRED:${schemaName}:${path}.${key}`);
        }
      }
      for (const [key, child] of Object.entries(properties)) visit(child, `${path}.${key}`);
    }

    if (value.items) visit(value.items, `${path}[]`);
    for (const keyword of ["anyOf", "oneOf", "allOf"] as const) {
      const variants = value[keyword];
      if (Array.isArray(variants)) variants.forEach((child, index) => visit(child, `${path}.${keyword}[${index}]`));
    }
    const defs = value.$defs;
    if (defs && typeof defs === "object") {
      for (const [key, child] of Object.entries(defs as Record<string, unknown>)) visit(child, `${path}.$defs.${key}`);
    }
  }

  visit(schema, "$ROOT");
}

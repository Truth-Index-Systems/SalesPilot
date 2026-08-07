/**
 * PostgreSQL text/jsonb cannot represent the NUL code point (U+0000).
 * AI/web content can occasionally contain it inside otherwise valid strings.
 * Strip only that forbidden code point recursively at the persistence boundary.
 */
export function stripPostgresNul(value: string): string {
  return value.replace(/\u0000/g, "");
}

export function sanitisePostgresJson<T>(value: T): T {
  if (typeof value === "string") return stripPostgresNul(value) as T;
  if (Array.isArray(value)) return value.map((item) => sanitisePostgresJson(item)) as T;
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      output[stripPostgresNul(key)] = sanitisePostgresJson(item);
    }
    return output as T;
  }
  return value;
}

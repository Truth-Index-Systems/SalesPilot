/** Safely normalise unknown external text at system boundaries. */
export function safeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function requiredText(value: unknown, errorCode: string): string {
  const text = safeText(value);
  if (!text) throw new Error(errorCode);
  return text;
}

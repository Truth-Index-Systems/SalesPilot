import type { GenesisT8CanonicalValueType } from "./token-theory";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DOMAIN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export function isIsoDateTime(value: string): boolean {
  return typeof value === "string" && value.trim() !== "" && Number.isFinite(Date.parse(value));
}

export function assertTemporalInterval(validFrom?: string, validTo?: string): void {
  if (validFrom && !isIsoDateTime(validFrom)) throw new Error("GENESIS_T8_TEMPORAL_VIOLATION:VALID_FROM");
  if (validTo && !isIsoDateTime(validTo)) throw new Error("GENESIS_T8_TEMPORAL_VIOLATION:VALID_TO");
  if (validFrom && validTo && Date.parse(validFrom) > Date.parse(validTo)) {
    throw new Error("GENESIS_T8_TEMPORAL_VIOLATION:REVERSED_INTERVAL");
  }
}

function stableObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableObject);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, stableObject(child)]));
  }
  return value;
}

export function canonicalSerialiseValue(valueType: GenesisT8CanonicalValueType, value: unknown): string {
  switch (valueType) {
    case "BOOLEAN":
      if (typeof value !== "boolean") throw new Error("GENESIS_T8_VALUE_VIOLATION:BOOLEAN");
      return value ? "true" : "false";
    case "INTEGER":
      if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error("GENESIS_T8_VALUE_VIOLATION:INTEGER");
      return String(value);
    case "DECIMAL":
    case "PERCENTAGE":
      if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`GENESIS_T8_VALUE_VIOLATION:${valueType}`);
      return String(value);
    case "DATE":
      if (typeof value !== "string" || !ISO_DATE.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`))) {
        throw new Error("GENESIS_T8_VALUE_VIOLATION:DATE");
      }
      return value;
    case "DATETIME":
      if (typeof value !== "string" || !isIsoDateTime(value)) throw new Error("GENESIS_T8_VALUE_VIOLATION:DATETIME");
      return new Date(value).toISOString();
    case "URL": {
      if (typeof value !== "string") throw new Error("GENESIS_T8_VALUE_VIOLATION:URL");
      let url: URL;
      try { url = new URL(value); } catch { throw new Error("GENESIS_T8_VALUE_VIOLATION:URL"); }
      if (!/^https?:$/.test(url.protocol)) throw new Error("GENESIS_T8_VALUE_VIOLATION:URL_PROTOCOL");
      return url.toString();
    }
    case "DOMAIN":
      if (typeof value !== "string" || !DOMAIN.test(value.trim())) throw new Error("GENESIS_T8_VALUE_VIOLATION:DOMAIN");
      return value.trim().toLowerCase();
    case "MONEY": {
      if (!value || typeof value !== "object") throw new Error("GENESIS_T8_VALUE_VIOLATION:MONEY");
      const amount = (value as Record<string, unknown>).amount;
      const currency = (value as Record<string, unknown>).currency;
      if (typeof amount !== "number" || !Number.isFinite(amount) || typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) {
        throw new Error("GENESIS_T8_VALUE_VIOLATION:MONEY");
      }
      return JSON.stringify({ amount, currency });
    }
    case "DURATION":
      if (typeof value !== "string" || !/^P(?!$)/.test(value)) throw new Error("GENESIS_T8_VALUE_VIOLATION:DURATION");
      return value;
    case "TEXT":
    case "ENUM":
    case "COUNTRY":
    case "REGION":
    case "ENTITY_REF":
    case "TOKEN_REF":
      if (typeof value !== "string" || !value.trim()) throw new Error(`GENESIS_T8_VALUE_VIOLATION:${valueType}`);
      return value.trim();
    default: {
      const exhaustive: never = valueType;
      throw new Error(`GENESIS_T8_VALUE_VIOLATION:UNKNOWN:${String(exhaustive)}`);
    }
  }
}

export function assertCanonicalValue(valueType: GenesisT8CanonicalValueType, value: unknown, canonicalValue: string): void {
  const expected = canonicalSerialiseValue(valueType, value);
  if (canonicalValue !== expected) {
    throw new Error("GENESIS_T8_VALUE_VIOLATION:CANONICAL_SERIALISATION_MISMATCH");
  }
}

export function stableFingerprint(parts: readonly string[]): string {
  // Persistence-neutral deterministic semantic key. Cryptographic fingerprinting is performed by freeze tooling.
  return parts.map((part) => `${part.length}:${part}`).join("|");
}

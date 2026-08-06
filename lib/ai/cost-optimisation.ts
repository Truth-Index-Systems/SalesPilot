import { createHash } from "node:crypto";

const META_KEYS = new Set([
  "created_at","updated_at","createdAt","updatedAt","lease_expires_at","lease_owner","scheduler_run_id",
  "attempt_count","next_attempt_at","last_heartbeat_at","last_error_code","last_error_message","organisation_id",
  "organisationId","workspace_id","workspaceId","outbox","timeline","history","retry","metadata"
]);

const TEXT_LIMITS: Record<string, number> = {
  summary: 700, description: 700, text: 900, content: 900, excerpt: 420, claim: 320,
  reasoning: 650, why: 420, reason: 420, operational_pain: 500, buying_reason: 500,
};

function truncate(value: string, key = ""): string {
  const limit = TEXT_LIMITS[key] ?? 700;
  return value.length > limit ? `${value.slice(0, limit - 1).trimEnd()}…` : value;
}

function evidenceScore(row: Record<string, unknown>): number {
  const quality = Number(row.qualityScore ?? row.quality_score ?? row.confidence ?? 0);
  const verified = row.verified === true ? 25 : 0;
  const matched = row.excerptMatched === true || row.excerpt_matched === true ? 15 : 0;
  const official = String(row.sourceKind ?? row.source_kind ?? "").startsWith("OFFICIAL") ? 15 : 0;
  return quality + verified + matched + official;
}

export function selectEvidence(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row))
    .sort((a, b) => evidenceScore(b) - evidenceScore(a))
    .slice(0, maximum)
    .map((row) => compactForAi(row, { evidenceLimit: maximum, depth: 2 }));
}

export function compactForAi(value: unknown, options: { evidenceLimit?: number; depth?: number } = {}): unknown {
  const depth = options.depth ?? 5;
  const evidenceLimit = options.evidenceLimit ?? 6;
  if (depth < 0 || value == null) return null;
  if (typeof value === "string") return truncate(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 12).map((item) => compactForAi(item, { evidenceLimit, depth: depth - 1 }));
  }
  if (typeof value !== "object") return String(value);
  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(source)) {
    if (META_KEYS.has(key) || item == null || item === "") continue;
    if (/evidence/i.test(key) && Array.isArray(item)) {
      result[key] = selectEvidence(item, evidenceLimit);
      continue;
    }
    if (typeof item === "string") result[key] = truncate(item, key);
    else result[key] = compactForAi(item, { evidenceLimit, depth: depth - 1 });
  }
  return result;
}

export function stableFingerprint(value: unknown): string {
  function stable(input: unknown): unknown {
    if (Array.isArray(input)) return input.map(stable);
    if (input && typeof input === "object") {
      return Object.fromEntries(Object.entries(input as Record<string, unknown>).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => [k, stable(v)]));
    }
    return input;
  }
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

export function compactCompanyDiscoveryInput(input: { campaign: Record<string, unknown>; business: Record<string, unknown>; customerWebsite?: string | null; excludedCompanies?: Array<{name:string;domain:string}> }) {
  return compactForAi({
    campaign: input.campaign,
    business: input.business,
    customerWebsite: input.customerWebsite ?? null,
    excludedCompanies: (input.excludedCompanies ?? []).slice(0, 100),
  }, { evidenceLimit: 6, depth: 5 });
}

export function compactContactDiscoveryInput(input: { company: Record<string, unknown>; campaign: Record<string, unknown>; business: Record<string, unknown> }) {
  return compactForAi({ company: input.company, campaign: input.campaign, business: input.business }, { evidenceLimit: 6, depth: 5 });
}

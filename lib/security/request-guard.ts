import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { databaseRequest } from "@/lib/database/postgrest";

const ANONYMOUS_VISITOR_COOKIE = "mr_anon_visitor";
const DEFAULT_ANONYMOUS_ANALYSIS_LIMIT = 3;
const DEFAULT_ANONYMOUS_ANALYSIS_WINDOW_DAYS = 365;
const DEFAULT_ANONYMOUS_IP_DAILY_LIMIT = 30;

function guardSecret(): string {
  const value =
    process.env.REQUEST_GUARD_SECRET ??
    process.env.DASHBOARD_SESSION_SECRET ??
    process.env.CRON_SECRET;
  if (!value) throw new Error("REQUEST_GUARD_SECRET_NOT_CONFIGURED");
  return value;
}

function clientAddress(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

function positiveInteger(value: string | undefined, fallback: number, allowZero = false): number {
  if (value == null || value.trim() === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  const minimum = allowZero ? 0 : 1;
  return Math.max(minimum, parsed);
}

export function anonymousAnalysisConfig() {
  return {
    limit: positiveInteger(process.env.MARKETROUTE_ANONYMOUS_ANALYSIS_LIMIT, DEFAULT_ANONYMOUS_ANALYSIS_LIMIT, true),
    windowDays: positiveInteger(process.env.MARKETROUTE_ANONYMOUS_ANALYSIS_WINDOW_DAYS, DEFAULT_ANONYMOUS_ANALYSIS_WINDOW_DAYS),
    ipDailyLimit: positiveInteger(process.env.MARKETROUTE_ANONYMOUS_ANALYSIS_IP_DAILY_LIMIT, DEFAULT_ANONYMOUS_IP_DAILY_LIMIT),
  };
}

export function requestFingerprint(request: Request, scope: string): string {
  const material = `${scope}:${clientAddress(request)}`;
  return createHmac("sha256", guardSecret()).update(material).digest("hex");
}

function fingerprintValue(scope: string, value: string): string {
  return createHmac("sha256", guardSecret()).update(`${scope}:${value}`).digest("hex");
}

function parseCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === name) return decodeURIComponent(rawValue.join("="));
  }
  return null;
}

function signAnonymousVisitor(id: string): string {
  const signature = createHmac("sha256", guardSecret()).update(`anonymous-visitor:${id}`).digest("base64url");
  return `${id}.${signature}`;
}

function verifiedAnonymousVisitor(value: string | null): string | null {
  if (!value) return null;
  const splitAt = value.lastIndexOf(".");
  if (splitAt <= 0) return null;
  const id = value.slice(0, splitAt);
  const supplied = value.slice(splitAt + 1);
  if (!/^[a-f0-9]{32}$/.test(id) || supplied.length < 32) return null;
  const expected = signAnonymousVisitor(id).slice(splitAt + 1);
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  if (suppliedBuffer.length !== expectedBuffer.length) return null;
  return timingSafeEqual(suppliedBuffer, expectedBuffer) ? id : null;
}

export type AnonymousVisitor = {
  id: string;
  cookieValue: string | null;
  cookieName: string;
  cookieMaxAge: number;
};

export function resolveAnonymousVisitor(request: Request): AnonymousVisitor {
  const existing = verifiedAnonymousVisitor(parseCookie(request, ANONYMOUS_VISITOR_COOKIE));
  const id = existing ?? randomBytes(16).toString("hex");
  const { windowDays } = anonymousAnalysisConfig();
  return {
    id,
    cookieValue: existing ? null : signAnonymousVisitor(id),
    cookieName: ANONYMOUS_VISITOR_COOKIE,
    cookieMaxAge: windowDays * 24 * 60 * 60,
  };
}

export async function consumeRequestLimit(
  request: Request,
  scope: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const result = await databaseRequest<boolean>("rpc/consume_request_security_limit", {
    method: "POST",
    body: JSON.stringify({
      p_scope: scope,
      p_fingerprint: requestFingerprint(request, scope),
      p_limit: limit,
      p_window_seconds: windowSeconds,
    }),
  });
  return result === true;
}

async function consumeFingerprintLimit(scope: string, fingerprint: string, limit: number, windowSeconds: number): Promise<boolean> {
  if (limit <= 0) return false;
  const result = await databaseRequest<boolean>("rpc/consume_request_security_limit", {
    method: "POST",
    body: JSON.stringify({ p_scope: scope, p_fingerprint: fingerprint, p_limit: limit, p_window_seconds: windowSeconds }),
  });
  return result === true;
}

async function requestLimitCount(scope: string, fingerprint: string, windowSeconds: number): Promise<number> {
  const rows = await databaseRequest<Array<{ attempt_count: number; window_started_at: string }>>(
    `request_security_limits?scope=eq.${encodeURIComponent(scope)}&fingerprint=eq.${encodeURIComponent(fingerprint)}&select=attempt_count,window_started_at&limit=1`,
  );
  const row = rows[0];
  if (!row) return 0;
  const started = Date.parse(row.window_started_at);
  if (!Number.isFinite(started) || started <= Date.now() - windowSeconds * 1000) return 0;
  return Math.max(0, row.attempt_count ?? 0);
}

export type AnonymousAnalysisAllowance = {
  limit: number;
  used: number;
  remaining: number;
};

export async function readAnonymousAnalysisAllowance(visitor: AnonymousVisitor): Promise<AnonymousAnalysisAllowance> {
  const config = anonymousAnalysisConfig();
  const windowSeconds = config.windowDays * 24 * 60 * 60;
  const fingerprint = fingerprintValue("PUBLIC_BUSINESS_ANALYSIS_VISITOR", visitor.id);
  const used = config.limit <= 0 ? 0 : await requestLimitCount("PUBLIC_BUSINESS_ANALYSIS_VISITOR", fingerprint, windowSeconds);
  return { limit: config.limit, used, remaining: Math.max(0, config.limit - used) };
}

export async function consumeAnonymousAnalysisAllowance(request: Request, visitor: AnonymousVisitor): Promise<{ allowed: boolean; allowance: AnonymousAnalysisAllowance }> {
  const config = anonymousAnalysisConfig();
  if (config.limit <= 0) return { allowed: false, allowance: { limit: 0, used: 0, remaining: 0 } };

  const windowSeconds = config.windowDays * 24 * 60 * 60;
  const visitorScope = "PUBLIC_BUSINESS_ANALYSIS_VISITOR";
  const visitorFingerprint = fingerprintValue(visitorScope, visitor.id);
  const visitorAllowed = await consumeFingerprintLimit(visitorScope, visitorFingerprint, config.limit, windowSeconds);
  const allowance = await readAnonymousAnalysisAllowance(visitor);
  if (!visitorAllowed) return { allowed: false, allowance };

  // Secondary abuse ceiling: intentionally much higher than the per-browser allowance.
  // This is not the customer-facing entitlement; it only slows repeated cookie resets from one connection.
  const ipAllowed = await consumeRequestLimit(request, "PUBLIC_BUSINESS_ANALYSIS_IP_SAFETY", config.ipDailyLimit, 24 * 60 * 60);
  return { allowed: ipAllowed, allowance };
}

export async function resetRequestLimit(request: Request, scope: string): Promise<void> {
  await databaseRequest("rpc/reset_request_security_limit", {
    method: "POST",
    body: JSON.stringify({
      p_scope: scope,
      p_fingerprint: requestFingerprint(request, scope),
    }),
  });
}

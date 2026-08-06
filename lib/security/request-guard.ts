import "server-only";
import { createHmac } from "node:crypto";
import { databaseRequest } from "@/lib/database/postgrest";

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

export function requestFingerprint(request: Request, scope: string): string {
  const material = `${scope}:${clientAddress(request)}`;
  return createHmac("sha256", guardSecret()).update(material).digest("hex");
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

export async function resetRequestLimit(request: Request, scope: string): Promise<void> {
  await databaseRequest("rpc/reset_request_security_limit", {
    method: "POST",
    body: JSON.stringify({
      p_scope: scope,
      p_fingerprint: requestFingerprint(request, scope),
    }),
  });
}

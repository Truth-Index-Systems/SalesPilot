import "server-only";
import { getDatabaseConfig } from "./config";
import { sanitisePostgresJson } from "./postgres-json";

export class DatabaseRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly details: unknown,
    public readonly requestPath?: string,
  ) {
    super("DATABASE_REQUEST_FAILED");
    this.name = "DatabaseRequestError";
  }
}

function parseDatabaseBody(raw: string): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return { message: raw.slice(0, 2_000), code: "NON_JSON_DATABASE_RESPONSE" };
  }
}

export async function databaseRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const config = getDatabaseConfig();
  const method = init.method ?? "GET";
  // Every PostgREST write is JSON in SalesPilot. Sanitise the parsed payload at
  // the single database boundary so AI/web control characters such as U+0000
  // cannot break one stage while a different stage remains protected.
  let safeInit = init;
  if (typeof init.body === "string") {
    try {
      safeInit = { ...init, body: JSON.stringify(sanitisePostgresJson(JSON.parse(init.body))) };
    } catch {
      // Keep non-JSON/string bodies unchanged; PostgREST will surface malformed
      // request bodies normally rather than this helper hiding the error.
    }
  }
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...safeInit,
    cache: "no-store",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
      ...(safeInit.headers ?? {}),
    },
  });

  const raw = await response.text();
  const data = parseDatabaseBody(raw);
  if (!response.ok) {
    // Do not log request bodies or credentials. The PostgREST path and returned
    // PostgreSQL details are enough to diagnose migration/RPC contract faults.
    console.error("[DATABASE_REQUEST_FAILED]", {
      method,
      path,
      status: response.status,
      details: data,
    });
    throw new DatabaseRequestError(response.status, data, path);
  }
  return data as T;
}

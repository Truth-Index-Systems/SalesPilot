import "server-only";
import { getDatabaseConfig } from "./config";

export class DatabaseRequestError extends Error {
  constructor(public readonly status: number, public readonly details: unknown) {
    super("DATABASE_REQUEST_FAILED");
  }
}

export async function databaseRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const config = getDatabaseConfig();
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const raw = await response.text();
  const data = raw ? JSON.parse(raw) : null;
  if (!response.ok) throw new DatabaseRequestError(response.status, data);
  return data as T;
}

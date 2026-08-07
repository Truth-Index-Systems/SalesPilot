import { DatabaseRequestError } from "@/lib/database/postgrest";

/**
 * PostgREST wraps PostgreSQL exceptions in DatabaseRequestError, so checking
 * Error.message alone only sees DATABASE_REQUEST_FAILED. Inspect the safe
 * returned database message as well when deciding whether a worker was
 * superseded by a newer owner.
 */
export function isPipelineOwnershipLost(error: unknown): boolean {
  const parts: string[] = [];
  if (error instanceof Error) parts.push(error.message);
  if (error instanceof DatabaseRequestError) {
    const details = error.details as { message?: unknown; code?: unknown } | null;
    if (typeof details?.message === "string") parts.push(details.message);
    if (typeof details?.code === "string") parts.push(details.code);
  }
  const text = parts.join(" ").toUpperCase();
  return text.includes("OWNERSHIP_LOST") || text.includes("SESSION_NOT_RUNNING") || text.includes("SESSION IS NOT RUNNING");
}

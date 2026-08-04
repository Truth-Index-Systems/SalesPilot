import "server-only";

export type DatabaseConfig = {
  url: string;
  serviceRoleKey: string;
  organisationId: string;
  createdBy: string;
};

export function getDatabaseConfig(): DatabaseConfig {
  if (process.env.NODE_ENV === "production" && process.env.SALESPILOT_ALLOW_DEV_PERSISTENCE !== "true") {
    throw new Error("CAMPAIGN_AUTH_NOT_READY");
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const organisationId = process.env.SALESPILOT_DEV_ORGANISATION_ID;
  const createdBy = process.env.SALESPILOT_DEV_USER_ID ?? "00000000-0000-0000-0000-000000000001";

  if (!url || !serviceRoleKey || !organisationId) {
    throw new Error("CAMPAIGN_DATABASE_NOT_CONFIGURED");
  }

  return { url: url.replace(/\/$/, ""), serviceRoleKey, organisationId, createdBy };
}

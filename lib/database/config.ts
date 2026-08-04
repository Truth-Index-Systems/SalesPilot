import "server-only";

export type DatabaseConfig = { url: string; serviceRoleKey: string; anonKey: string };

export function getDatabaseConfig(): DatabaseConfig {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !serviceRoleKey || !anonKey) throw new Error("CAMPAIGN_DATABASE_NOT_CONFIGURED");
  return { url: url.replace(/\/$/, ""), serviceRoleKey, anonKey };
}

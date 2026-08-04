import "server-only";
import { getDatabaseConfig } from "@/lib/database/config";
import { cookies } from "next/headers";
import { databaseRequest } from "@/lib/database/postgrest";

export type OrganisationContext = { userId: string; organisationId: string; role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER" };

type SessionShape = { access_token?: string } | [string, string, number?, number?, string?];

function decodeSession(raw: string): SessionShape | null {
  try {
    const decoded = decodeURIComponent(raw);
    const json = decoded.startsWith("base64-") ? Buffer.from(decoded.slice(7), "base64").toString("utf8") : decoded;
    return JSON.parse(json) as SessionShape;
  } catch { return null; }
}

async function getAccessToken(): Promise<string | null> {
  const store = await cookies();
  const all = store.getAll();
  const bases = [...new Set(all.map(c => c.name.replace(/\.\d+$/, "")).filter(n => /^sb-.+-auth-token$/.test(n)))];
  for (const base of bases) {
    const direct = store.get(base)?.value;
    const raw = direct ?? all.filter(c => c.name.startsWith(`${base}.`)).sort((a,b) => Number(a.name.split(".").pop()) - Number(b.name.split(".").pop())).map(c => c.value).join("");
    if (!raw) continue;
    const session = decodeSession(raw);
    if (Array.isArray(session) && typeof session[0] === "string") return session[0];
    if (session && !Array.isArray(session) && session.access_token) return session.access_token;
  }
  return null;
}

export async function requireOrganisationContext(options: { canLaunch?: boolean } = {}): Promise<OrganisationContext> {
  if (process.env.NODE_ENV !== "production" && process.env.SALESPILOT_ALLOW_DEV_PERSISTENCE === "true") {
    const organisationId = process.env.SALESPILOT_DEV_ORGANISATION_ID;
    const userId = process.env.SALESPILOT_DEV_USER_ID;
    if (organisationId && userId) return { organisationId, userId, role: "OWNER" };
  }

  const token = await getAccessToken();
  if (!token) throw new Error("AUTHENTICATION_REQUIRED");
  const config = getDatabaseConfig();
  const response = await fetch(`${config.url}/auth/v1/user`, { cache: "no-store", headers: { apikey: config.anonKey, Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error("AUTHENTICATION_REQUIRED");
  const user = await response.json() as { id?: string };
  if (!user.id) throw new Error("AUTHENTICATION_REQUIRED");

  const memberships = await databaseRequest<Array<{ organisation_id: string; role: OrganisationContext["role"] }>>(
    `organisation_memberships?user_id=eq.${encodeURIComponent(user.id)}&status=eq.ACTIVE&select=organisation_id,role&order=created_at.asc&limit=1`
  );
  const membership = memberships[0];
  if (!membership) throw new Error("ORGANISATION_MEMBERSHIP_REQUIRED");
  if (options.canLaunch && !["OWNER", "ADMIN"].includes(membership.role)) throw new Error("CAMPAIGN_LAUNCH_FORBIDDEN");
  return { userId: user.id, organisationId: membership.organisation_id, role: membership.role };
}

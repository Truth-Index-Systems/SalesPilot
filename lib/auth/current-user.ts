import "server-only";
import { cookies } from "next/headers";
import { getDatabaseConfig } from "@/lib/database/config";

type SessionShape = { access_token?: string } | [string, string, number?, number?, string?];

export type SalesPilotUser = {
  id: string;
  email: string | null;
  name: string;
};

function decodeSession(raw: string): SessionShape | null {
  try {
    const decoded = decodeURIComponent(raw);
    const json = decoded.startsWith("base64-")
      ? Buffer.from(decoded.slice(7), "base64").toString("utf8")
      : decoded;
    return JSON.parse(json) as SessionShape;
  } catch {
    return null;
  }
}

async function getAccessToken(): Promise<string | null> {
  const store = await cookies();
  const all = store.getAll();
  const bases = [...new Set(
    all
      .map(cookie => cookie.name.replace(/\.\d+$/, ""))
      .filter(name => /^sb-.+-auth-token$/.test(name)),
  )];

  for (const base of bases) {
    const direct = store.get(base)?.value;
    const raw = direct ?? all
      .filter(cookie => cookie.name.startsWith(`${base}.`))
      .sort((a, b) => Number(a.name.split(".").pop()) - Number(b.name.split(".").pop()))
      .map(cookie => cookie.value)
      .join("");

    if (!raw) continue;
    const session = decodeSession(raw);
    if (Array.isArray(session) && typeof session[0] === "string") return session[0];
    if (session && !Array.isArray(session) && session.access_token) return session.access_token;
  }

  return null;
}

export async function getCurrentUser(): Promise<SalesPilotUser | null> {
  const token = await getAccessToken();
  if (!token) return null;

  try {
    const config = getDatabaseConfig();
    const response = await fetch(`${config.url}/auth/v1/user`, {
      cache: "no-store",
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) return null;

    const user = await response.json() as {
      id?: string;
      email?: string;
      user_metadata?: { full_name?: string; name?: string };
    };

    if (!user.id) return null;

    const metadataName = user.user_metadata?.full_name?.trim() || user.user_metadata?.name?.trim();
    const emailName = user.email?.split("@")[0]?.replace(/[._-]+/g, " ").trim();
    const name = metadataName || emailName || "Account";

    return {
      id: user.id,
      email: user.email ?? null,
      name,
    };
  } catch (error) {
    console.error("SalesPilot session lookup failed", error);
    return null;
  }
}

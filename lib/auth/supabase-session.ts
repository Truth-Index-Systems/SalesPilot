import type { NextRequest, NextResponse } from "next/server";

export type SupabaseSession = {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  expires_at?: number;
  token_type?: string;
  user?: { id?: string; email?: string };
};

function getSupabaseUrl(): string {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!value) throw new Error("CAMPAIGN_DATABASE_NOT_CONFIGURED");
  return value.replace(/\/$/, "");
}

export function getSupabaseAnonKey(): string {
  const value = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!value) throw new Error("CAMPAIGN_DATABASE_NOT_CONFIGURED");
  return value;
}

export function getSupabaseAuthCookieName(): string {
  const hostname = new URL(getSupabaseUrl()).hostname;
  const projectRef = hostname.split(".")[0];
  return `sb-${projectRef}-auth-token`;
}

function decodeBase64Utf8(value: string): string {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function decodeCookieValue(raw: string): SupabaseSession | null {
  try {
    const decoded = decodeURIComponent(raw);
    const json = decoded.startsWith("base64-")
      ? decodeBase64Utf8(decoded.slice(7))
      : decoded;
    const parsed = JSON.parse(json) as SupabaseSession | [string, string, number?, number?, string?];
    if (Array.isArray(parsed)) {
      const [access_token, refresh_token, expires_at, expires_in, token_type] = parsed;
      if (!access_token || !refresh_token) return null;
      return { access_token, refresh_token, expires_at, expires_in, token_type };
    }
    return parsed?.access_token && parsed?.refresh_token ? parsed : null;
  } catch {
    return null;
  }
}

export function encodeSessionCookie(session: SupabaseSession): string {
  return JSON.stringify([
    session.access_token,
    session.refresh_token,
    session.expires_at,
    session.expires_in,
    session.token_type ?? "bearer",
  ]);
}

export function readSessionFromRequest(request: NextRequest): SupabaseSession | null {
  const base = getSupabaseAuthCookieName();
  const direct = request.cookies.get(base)?.value;
  if (direct) return decodeCookieValue(direct);

  const chunks = request.cookies
    .getAll()
    .filter(cookie => cookie.name.startsWith(`${base}.`))
    .sort((a, b) => Number(a.name.split(".").pop()) - Number(b.name.split(".").pop()))
    .map(cookie => cookie.value)
    .join("");

  return chunks ? decodeCookieValue(chunks) : null;
}

export function writeSessionCookie(response: NextResponse, session: SupabaseSession): void {
  const name = getSupabaseAuthCookieName();
  response.cookies.set(name, encodeSessionCookie(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  const name = getSupabaseAuthCookieName();
  response.cookies.set(name, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  for (let index = 0; index < 8; index += 1) {
    response.cookies.set(`${name}.${index}`, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }
}

export async function refreshSupabaseSession(session: SupabaseSession): Promise<SupabaseSession | null> {
  const response = await fetch(`${getSupabaseUrl()}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      apikey: getSupabaseAnonKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
    cache: "no-store",
  });

  if (!response.ok) return null;
  const refreshed = await response.json() as SupabaseSession;
  if (!refreshed.access_token || !refreshed.refresh_token) return null;
  return refreshed;
}

export function sessionNeedsRefresh(session: SupabaseSession): boolean {
  if (!session.expires_at) return false;
  return session.expires_at * 1000 <= Date.now() + 60_000;
}

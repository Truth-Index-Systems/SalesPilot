import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAnonKey, writeSessionCookie, type SupabaseSession } from "@/lib/auth/supabase-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SignInSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(256),
});

function getSupabaseUrl(): string {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!value) throw new Error("CAMPAIGN_DATABASE_NOT_CONFIGURED");
  return value.replace(/\/$/, "");
}

export async function POST(request: Request) {
  try {
    const input = SignInSchema.parse(await request.json());
    const authResponse = await fetch(`${getSupabaseUrl()}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: getSupabaseAnonKey(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
      cache: "no-store",
    });

    if (!authResponse.ok) {
      return NextResponse.json({
        ok: false,
        error: {
          title: "Sign in unsuccessful",
          message: "The email address or password was not recognised.",
          hint: "Check your details and try again.",
        },
      }, { status: 401 });
    }

    const session = await authResponse.json() as SupabaseSession;
    if (!session.access_token || !session.refresh_token) throw new Error("INVALID_AUTH_RESPONSE");

    const response = NextResponse.json({ ok: true });
    writeSessionCookie(response, session);
    return response;
  } catch (error) {
    console.error("SalesPilot sign-in failed", error);
    return NextResponse.json({
      ok: false,
      error: {
        title: "Sign in unavailable",
        message: "SalesPilot could not complete sign in.",
        hint: "Please try again shortly.",
      },
    }, { status: 500 });
  }
}

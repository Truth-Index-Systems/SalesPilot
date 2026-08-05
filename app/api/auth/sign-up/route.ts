import { NextResponse } from "next/server";
import { z } from "zod";
import { databaseRequest, DatabaseRequestError } from "@/lib/database/postgrest";
import { getSupabaseAnonKey, writeSessionCookie, type SupabaseSession } from "@/lib/auth/supabase-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SignUpSchema = z.object({
  name: z.string().trim().min(2).max(100),
  workspaceName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(256),
});

function getSupabaseUrl(): string {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!value) throw new Error("CAMPAIGN_DATABASE_NOT_CONFIGURED");
  return value.replace(/\/$/, "");
}

function slugify(value: string, userId: string): string {
  const base = value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 42) || "workspace";
  return `${base}-${userId.replace(/-/g, "").slice(0, 8)}`;
}

export async function POST(request: Request) {
  try {
    const input = SignUpSchema.parse(await request.json());
    const origin = new URL(request.url).origin;
    const authResponse = await fetch(`${getSupabaseUrl()}/auth/v1/signup?redirect_to=${encodeURIComponent(`${origin}/sign-in?confirmed=1`)}`, {
      method: "POST",
      headers: { apikey: getSupabaseAnonKey(), "Content-Type": "application/json" },
      body: JSON.stringify({ email: input.email, password: input.password, data: { full_name: input.name } }),
      cache: "no-store",
    });

    const authResult = await authResponse.json() as SupabaseSession & { id?: string; msg?: string; message?: string; user?: { id?: string } };
    if (!authResponse.ok) {
      const duplicate = /already|registered|exists/i.test(authResult.msg ?? authResult.message ?? "");
      return NextResponse.json({ ok: false, error: duplicate ? {
        title: "Account already exists", message: "An account already uses this email address.", hint: "Return to sign in or reset the password in Supabase.",
      } : {
        title: "Account could not be created", message: "SalesPilot could not create this account.", hint: "Check your details and try again.",
      } }, { status: duplicate ? 409 : 400 });
    }
    if (!authResponse.ok) {
  console.error("Supabase signup rejected", {
    status: authResponse.status,
    response: authResult,
  });

  const duplicate = /already|registered|exists|user_already_exists/i.test(
    JSON.stringify(authResult),
  );

  return NextResponse.json(
    {
      ok: false,
      error: duplicate
        ? {
            title: "Account already exists",
            message: "An account already uses this email address.",
            hint: "Sign in instead or use a different email address.",
          }
        : {
            title: "Account could not be created",
            message: "SalesPilot could not create this account.",
            hint: "Check your details and try again.",
          },
    },
    { status: duplicate ? 409 : 400 },
  );
}
    const userId = authResult.user?.id ?? authResult.id;
    if (!userId) throw new Error("INVALID_AUTH_RESPONSE");
    await databaseRequest("rpc/provision_salespilot_workspace", {
      method: "POST",
      body: JSON.stringify({ p_user_id: userId, p_name: input.workspaceName, p_slug: slugify(input.workspaceName, userId) }),
    });

    const signedIn = Boolean(authResult.access_token && authResult.refresh_token);
    const response = NextResponse.json({ ok: true, signedIn, confirmationRequired: !signedIn });
    if (signedIn) writeSessionCookie(response, authResult);
    return response;
  } catch (error) {
    if (error instanceof DatabaseRequestError) console.error("SalesPilot workspace provisioning failed", error.details);
    else console.error("SalesPilot sign-up failed", error);
    return NextResponse.json({ ok: false, error: {
      title: "Account creation unavailable", message: "SalesPilot could not finish creating your workspace.", hint: "Please try again shortly.",
    } }, { status: 500 });
  }
}

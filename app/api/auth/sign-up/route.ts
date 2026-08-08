import { NextResponse } from "next/server";
import { z } from "zod";
import {
  databaseRequest,
  DatabaseRequestError,
} from "@/lib/database/postgrest";
import {
  getSupabaseAnonKey,
  writeSessionCookie,
  type SupabaseSession,
} from "@/lib/auth/supabase-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SignUpSchema = z.object({
  name: z.string().trim().min(2).max(100),
  workspaceName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(256),
  next: z.string().max(500).optional(),
});

type SupabaseAuthResult = Partial<SupabaseSession> & {
  id?: string;
  code?: string;
  error_code?: string;
  msg?: string;
  message?: string;
  user?: {
    id?: string;
    email?: string;
    identities?: unknown[];
  };
};

function getSupabaseUrl(): string {
  const value =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;

  if (!value) {
    throw new Error("CAMPAIGN_DATABASE_NOT_CONFIGURED");
  }

  return value.replace(/\/$/, "");
}

function safeNextPath(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/campaigns/new";
  }

  return value;
}

function getApplicationUrl(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL;

  if (configured) {
    return configured.replace(/\/$/, "");
  }

  return new URL(request.url).origin;
}

function slugify(value: string, userId: string): string {
  const base =
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 42) || "workspace";

  return `${base}-${userId.replace(/-/g, "").slice(0, 8)}`;
}

function authErrorText(result: SupabaseAuthResult): string {
  return [result.code, result.error_code, result.msg, result.message]
    .filter(Boolean)
    .join(" ");
}

function isExistingAccount(result: SupabaseAuthResult): boolean {
  const text = authErrorText(result);

  return (
    /already|registered|exists|user_already_exists/i.test(text) ||
    (Array.isArray(result.user?.identities) &&
      result.user.identities.length === 0)
  );
}

async function signInWithPassword(
  email: string,
  password: string,
): Promise<{ response: Response; result: SupabaseAuthResult }> {
  const response = await fetch(
    `${getSupabaseUrl()}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: getSupabaseAnonKey(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    },
  );

  const result = (await response.json()) as SupabaseAuthResult;
  return { response, result };
}

async function provisionWorkspace(
  userId: string,
  workspaceName: string,
): Promise<void> {
  await databaseRequest("rpc/provision_salespilot_workspace", {
    method: "POST",
    body: JSON.stringify({
      p_user_id: userId,
      p_name: workspaceName,
      p_slug: slugify(workspaceName, userId),
    }),
  });
}

function accountAlreadyExistsResponse() {
  return NextResponse.json(
    {
      ok: false,
      error: {
        title: "Account already exists",
        message: "An account already uses this email address.",
        hint: "Sign in with the password for this account to continue.",
      },
    },
    { status: 409 },
  );
}

export async function POST(request: Request) {
  try {
    const input = SignUpSchema.parse(await request.json());
    const applicationUrl = getApplicationUrl(request);
    const nextPath = safeNextPath(input.next);
    const confirmationUrl = `${applicationUrl}/sign-in?confirmed=1&next=${encodeURIComponent(nextPath)}`;

    const authResponse = await fetch(
      `${getSupabaseUrl()}/auth/v1/signup?redirect_to=${encodeURIComponent(
        confirmationUrl,
      )}`,
      {
        method: "POST",
        headers: {
          apikey: getSupabaseAnonKey(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: input.email,
          password: input.password,
          data: { full_name: input.name },
        }),
        cache: "no-store",
      },
    );

    const authResult = (await authResponse.json()) as SupabaseAuthResult;

    if (!authResponse.ok || isExistingAccount(authResult)) {
      console.error("Supabase sign-up rejected", {
        status: authResponse.status,
        code: authResult.code ?? authResult.error_code,
        message: authResult.msg ?? authResult.message,
      });

      if (!isExistingAccount(authResult)) {
        const text = authErrorText(authResult);
        const rateLimited =
          authResponse.status === 429 ||
          /rate|too many|over_email_send_rate_limit/i.test(text);

        return NextResponse.json(
          {
            ok: false,
            error: rateLimited
              ? {
                  title: "Please wait before trying again",
                  message: "Too many account requests were made recently.",
                  hint: "Wait a few minutes, then try again.",
                }
              : {
                  title: "Account could not be created",
                  message: "MarketRoute could not create this account.",
                  hint: "Check your details and try again.",
                },
          },
          { status: rateLimited ? 429 : 400 },
        );
      }

      // Recovery path for a prior partial signup:
      // authenticate the existing user with the submitted password, then
      // idempotently create or reuse their MarketRoute workspace.
      const signIn = await signInWithPassword(input.email, input.password);

      if (!signIn.response.ok) {
        console.error("Existing account recovery sign-in rejected", {
          status: signIn.response.status,
          code: signIn.result.code ?? signIn.result.error_code,
          message: signIn.result.msg ?? signIn.result.message,
        });

        return accountAlreadyExistsResponse();
      }

      const userId = signIn.result.user?.id;
      if (
        !userId ||
        !signIn.result.access_token ||
        !signIn.result.refresh_token
      ) {
        throw new Error("INVALID_AUTH_RESPONSE");
      }

      await provisionWorkspace(userId, input.workspaceName);

      const response = NextResponse.json({
        ok: true,
        signedIn: true,
        confirmationRequired: false,
        recovered: true,
      });

      writeSessionCookie(response, signIn.result as SupabaseSession);
      return response;
    }

    const userId = authResult.user?.id ?? authResult.id;
    if (!userId) {
      throw new Error("INVALID_AUTH_RESPONSE");
    }

    await provisionWorkspace(userId, input.workspaceName);

    const signedIn = Boolean(
      authResult.access_token && authResult.refresh_token,
    );

    const response = NextResponse.json({
      ok: true,
      signedIn,
      confirmationRequired: !signedIn,
      recovered: false,
    });

    if (signedIn) {
      writeSessionCookie(response, authResult as SupabaseSession);
    }

    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            title: "Review your details",
            message: "Some account details are incomplete or invalid.",
            hint: "Check each field and try again.",
          },
        },
        { status: 400 },
      );
    }

    if (error instanceof DatabaseRequestError) {
      console.error("MarketRoute workspace provisioning failed", {
        status: error.status,
        details: error.details,
      });
    } else {
      console.error("MarketRoute sign-up failed", error);
    }

    return NextResponse.json(
      {
        ok: false,
        error: {
          title: "Account creation unavailable",
          message: "MarketRoute could not finish creating your workspace.",
          hint: "Please try again shortly.",
        },
      },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { readSessionFromRequest, refreshSupabaseSession, sessionNeedsRefresh, writeSessionCookie } from "@/lib/auth/supabase-session";

export async function middleware(request: NextRequest) {
  const existingSession = readSessionFromRequest(request);
  if (!existingSession || !sessionNeedsRefresh(existingSession)) return NextResponse.next();

  const refreshedSession = await refreshSupabaseSession(existingSession);
  const response = NextResponse.next();
  if (refreshedSession) writeSessionCookie(response, refreshedSession);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|marketroute-logo.png|marketroute-mark.png).*)"],
};

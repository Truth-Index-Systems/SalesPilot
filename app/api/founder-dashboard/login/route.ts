import { NextRequest, NextResponse } from "next/server";
import { createDashboardSessionValue, dashboardCookieOptions, founderDashboardCookieName, verifyDashboardPassword } from "@/lib/founder-dashboard/auth";
import { consumeRequestLimit, resetRequestLimit } from "@/lib/security/request-guard";

export async function POST(request: NextRequest) {
  const allowed = await consumeRequestLimit(request, "FOUNDER_DASHBOARD_LOGIN", 10, 15 * 60);
  if (!allowed) {
    return NextResponse.redirect(new URL("/dashboard/login?error=locked", request.url), 303);
  }
  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  if (!verifyDashboardPassword(password)) {
    return NextResponse.redirect(new URL("/dashboard/login?error=invalid", request.url), 303);
  }
  await resetRequestLimit(request, "FOUNDER_DASHBOARD_LOGIN");
  const response = NextResponse.redirect(new URL("/dashboard", request.url), 303);
  response.cookies.set(founderDashboardCookieName, createDashboardSessionValue(), dashboardCookieOptions());
  return response;
}

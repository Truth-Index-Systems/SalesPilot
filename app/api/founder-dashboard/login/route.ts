import { NextRequest, NextResponse } from "next/server";
import { createDashboardSessionValue, dashboardCookieOptions, founderDashboardCookieName, verifyDashboardPassword } from "@/lib/founder-dashboard/auth";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  if (!verifyDashboardPassword(password)) {
    return NextResponse.redirect(new URL("/dashboard/login?error=invalid", request.url), 303);
  }
  const response = NextResponse.redirect(new URL("/dashboard", request.url), 303);
  response.cookies.set(founderDashboardCookieName, createDashboardSessionValue(), dashboardCookieOptions());
  return response;
}

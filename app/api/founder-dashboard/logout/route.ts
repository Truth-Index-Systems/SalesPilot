import { NextRequest, NextResponse } from "next/server";
import { dashboardCookieOptions, founderDashboardCookieName } from "@/lib/founder-dashboard/auth";

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/dashboard/login", request.url), 303);
  response.cookies.set(founderDashboardCookieName, "", { ...dashboardCookieOptions(), maxAge: 0 });
  return response;
}

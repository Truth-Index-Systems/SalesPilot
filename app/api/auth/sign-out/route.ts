import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth/supabase-session";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}

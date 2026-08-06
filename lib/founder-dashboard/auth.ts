import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "salespilot_founder_dashboard";
const MAX_AGE_SECONDS = 60 * 60 * 12;

function secret(): string {
  const value = process.env.DASHBOARD_SESSION_SECRET ?? process.env.DASHBOARD_PASSWORD;
  if (!value) throw new Error("DASHBOARD_PASSWORD_NOT_CONFIGURED");
  return value;
}

function signature(expiresAt: string): string {
  return createHmac("sha256", secret()).update(`founder:${expiresAt}`).digest("hex");
}

export function verifyDashboardPassword(candidate: string): boolean {
  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected || !candidate) return false;
  const left = Buffer.from(candidate);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createDashboardSessionValue(): string {
  const expiresAt = String(Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS);
  return `${expiresAt}.${signature(expiresAt)}`;
}

export function dashboardCookieOptions() {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/dashboard", maxAge: MAX_AGE_SECONDS };
}

export async function hasFounderDashboardSession(): Promise<boolean> {
  const value = (await cookies()).get(COOKIE_NAME)?.value;
  if (!value) return false;
  const [expiresAt, supplied] = value.split(".");
  if (!expiresAt || !supplied || Number(expiresAt) <= Math.floor(Date.now() / 1000)) return false;
  const expected = signature(expiresAt);
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export const founderDashboardCookieName = COOKIE_NAME;

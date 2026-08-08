import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser, type MarketRouteUser } from "@/lib/auth/current-user";

export async function requirePageUser(nextPath: string): Promise<MarketRouteUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/sign-in?next=${encodeURIComponent(nextPath)}`);
    throw new Error("AUTHENTICATION_REQUIRED");
  }
  return user;
}

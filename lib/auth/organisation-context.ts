import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";
import { getCurrentUser } from "@/lib/auth/current-user";

export type OrganisationContext = {
  userId: string;
  organisationId: string;
  role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
};

export async function requireOrganisationContext(
  options: { canLaunch?: boolean } = {},
): Promise<OrganisationContext> {
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.SALESPILOT_ALLOW_DEV_PERSISTENCE === "true"
  ) {
    const organisationId = process.env.SALESPILOT_DEV_ORGANISATION_ID;
    const userId = process.env.SALESPILOT_DEV_USER_ID;
    if (organisationId && userId) {
      return { organisationId, userId, role: "OWNER" };
    }
  }

  const user = await getCurrentUser();
  if (!user) throw new Error("AUTHENTICATION_REQUIRED");

  const memberships = await databaseRequest<
    Array<{ organisation_id: string; role: OrganisationContext["role"] }>
  >(
    `organisation_memberships?user_id=eq.${encodeURIComponent(user.id)}&status=eq.ACTIVE&select=organisation_id,role&order=created_at.asc&limit=1`,
  );

  const membership = memberships[0];
  if (!membership) throw new Error("ORGANISATION_MEMBERSHIP_REQUIRED");
  if (options.canLaunch && !["OWNER", "ADMIN"].includes(membership.role)) {
    throw new Error("CAMPAIGN_LAUNCH_FORBIDDEN");
  }

  return {
    userId: user.id,
    organisationId: membership.organisation_id,
    role: membership.role,
  };
}

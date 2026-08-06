import { NextResponse } from "next/server";
import { z } from "zod";
import { LaunchCampaignRequestSchema } from "@/lib/campaigns/schemas";
import { launchCampaignService } from "@/features/campaigns/campaign-launch.service";
import { requireOrganisationContext } from "@/lib/auth/organisation-context";
import { DatabaseRequestError } from "@/lib/database/postgrest";
import { normaliseBusinessAnalysis } from "@/lib/intelligence/fit-score";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeError(error: unknown) {
  if (error instanceof z.ZodError || (error instanceof Error && error.message === "SELECTED_PROPOSAL_NOT_FOUND")) return { status: 400, body: { code: "INVALID_CAMPAIGN", title: "Review the campaign", message: "The selected strategy could not be validated.", hint: "Return to the previous step and select the campaign again." } };
  if (error instanceof Error && error.message === "AUTHENTICATION_REQUIRED") return { status: 401, body: { code: "SIGN_IN_REQUIRED", title: "Sign in to launch this campaign", message: "Your session could not be confirmed.", hint: "Sign in again, then retry. Your selected strategy is still available." } };
  if (error instanceof Error && ["ORGANISATION_MEMBERSHIP_REQUIRED", "CAMPAIGN_LAUNCH_FORBIDDEN"].includes(error.message)) return { status: 403, body: { code: "WORKSPACE_ACCESS_REQUIRED", title: "Campaign launch is not available", message: "Your workspace access does not allow campaign launch.", hint: "Ask a workspace owner or administrator for access." } };
  if (error instanceof Error && error.message === "CAMPAIGN_DATABASE_NOT_CONFIGURED") return { status: 503, body: { code: "CAMPAIGN_STORAGE_NOT_READY", title: "Campaign saving is not configured", message: "SalesPilot cannot save campaigns until the protected workspace connection is completed.", hint: "Complete the Supabase environment setup, then try again." } };
  return { status: 500, body: { code: "CAMPAIGN_LAUNCH_FAILED", title: "Campaign could not be launched", message: "SalesPilot could not save this campaign.", hint: "Please try again. Your selected strategy is still available." } };
}

export async function POST(request: Request) {
  try {
    const parsed = LaunchCampaignRequestSchema.parse(await request.json());
    const input = { ...parsed, businessAnalysis: normaliseBusinessAnalysis(parsed.businessAnalysis) };
    if (!input.businessAnalysis.payload.campaigns.some(item => item.id === input.selectedProposalId)) throw new Error("SELECTED_PROPOSAL_NOT_FOUND");
    const context = await requireOrganisationContext({ canLaunch: true });
    const campaign = await launchCampaignService(input, context);
    return NextResponse.json({ ok: true, campaign: { id: campaign.id, redirectUrl: `/campaigns/${campaign.id}` } });
  } catch (error) {
    if (error instanceof DatabaseRequestError) console.error("Campaign database request failed", error.details);
    else console.error("Campaign launch failed", error);
    const mapped = safeError(error);
    return NextResponse.json({ ok: false, error: mapped.body }, { status: mapped.status });
  }
}

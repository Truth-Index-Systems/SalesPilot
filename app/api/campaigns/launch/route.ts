import { NextResponse } from "next/server";
import { z } from "zod";
import { LaunchCampaignRequestSchema } from "@/lib/campaigns/schemas";
import { launchCampaign } from "@/lib/campaigns/repository";
import { DatabaseRequestError } from "@/lib/database/postgrest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeError(error: unknown) {
  if (error instanceof z.ZodError || (error instanceof Error && error.message === "SELECTED_PROPOSAL_NOT_FOUND")) {
    return { status: 400, body: { code: "INVALID_CAMPAIGN", title: "Review the campaign", message: "The selected strategy could not be validated.", hint: "Return to the previous step and select the campaign again." } };
  }
  if (error instanceof Error && error.message === "CAMPAIGN_AUTH_NOT_READY") {
    return { status: 503, body: { code: "CAMPAIGN_AUTH_NOT_READY", title: "Campaign launch is not enabled yet", message: "The protected workspace connection must be completed before campaigns can be saved in production.", hint: "Use the development persistence flag locally, or connect workspace authentication before launch." } };
  }
  if (error instanceof Error && error.message === "CAMPAIGN_DATABASE_NOT_CONFIGURED") {
    return { status: 503, body: { code: "CAMPAIGN_STORAGE_NOT_READY", title: "Campaign saving is not configured", message: "SalesPilot cannot save campaigns until the database connection is completed.", hint: "Add the Supabase campaign environment variables, then try again." } };
  }
  return { status: 500, body: { code: "CAMPAIGN_LAUNCH_FAILED", title: "Campaign could not be launched", message: "SalesPilot could not save the campaign.", hint: "Please try again. Your selected strategy has not been lost." } };
}

export async function POST(request: Request) {
  try {
    const input = LaunchCampaignRequestSchema.parse(await request.json());
    const selected = input.businessAnalysis.payload.campaigns.find(item => item.id === input.selectedProposalId);
    if (!selected) throw new Error("SELECTED_PROPOSAL_NOT_FOUND");
    const campaign = await launchCampaign(input);
    return NextResponse.json({ ok: true, campaign: { ...campaign, redirectUrl: `/campaigns/${campaign.id}` } });
  } catch (error) {
    if (error instanceof DatabaseRequestError) console.error("Campaign database request failed", error.details);
    else console.error("Campaign launch failed", error);
    const mapped = safeError(error);
    return NextResponse.json({ ok: false, error: mapped.body }, { status: mapped.status });
  }
}

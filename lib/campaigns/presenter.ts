import type { CampaignDetail, CampaignSummary } from "./schemas";
import { campaignMatchLabel } from "@/lib/intelligence/fit-score";

export function presentCampaignStatus(status: CampaignSummary["status"]): string {
  switch (status) {
    case "PREPARING": return "SalesPilot is preparing this campaign";
    case "READY": return "Ready for the next stage";
    case "PAUSED": return "Paused";
    case "ARCHIVED": return "Archived";
    case "DRAFT": return "Draft";
  }
}

export function presentAutomationMode(mode: CampaignSummary["automationMode"]): string {
  if (mode === "autopilot") return "Autopilot";
  if (mode === "approval") return "Approval mode";
  return "Assisted mode";
}

export function presentMatch(fitScore: number): string {
  return campaignMatchLabel(fitScore);
}

export type PresentedCampaignDetail = CampaignDetail & {
  statusLabel: string;
  modeLabel: string;
  matchLabel: string;
};

export function presentCampaignDetail(campaign: CampaignDetail): PresentedCampaignDetail {
  return {
    ...campaign,
    statusLabel: presentCampaignStatus(campaign.status),
    modeLabel: presentAutomationMode(campaign.automationMode),
    matchLabel: presentMatch(campaign.fitScore),
  };
}

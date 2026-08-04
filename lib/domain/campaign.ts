export type CampaignStatus = "DRAFT"|"ANALYSING"|"READY"|"DISCOVERING"|"QUALIFYING"|"ENRICHING"|"PREPARING"|"AWAITING_APPROVAL"|"ACTIVE"|"PAUSED"|"COMPLETED"|"FAILED"|"ARCHIVED";
export type AutomationMode = "AUTOPILOT"|"APPROVAL"|"ASSISTED";
export type Campaign = {
  id:string; organisationId:string; name:string; status:CampaignStatus; automationMode:AutomationMode;
  currentVersion:number; objective:string; createdAt:string; updatedAt:string;
};
export type CampaignVersion = { campaignId:string; version:number; configuration:Record<string,unknown>; reason:string; effectiveAt:string; createdBy:string };

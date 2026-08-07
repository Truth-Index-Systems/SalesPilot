/** Canonical persisted campaign domain. Historical transient pipeline stage names
 * do not belong in campaign.status; stage/progress is derived from worker state. */
export type CampaignStatus = "DRAFT"|"PREPARING"|"READY"|"PAUSED"|"FAILED"|"ARCHIVED";
export type AutomationMode = "AUTOPILOT"|"APPROVAL"|"ASSISTED";
export type Campaign = {
  id:string; organisationId:string; name:string; status:CampaignStatus; automationMode:AutomationMode;
  currentVersion:number; objective:string; createdAt:string; updatedAt:string;
};
export type CampaignVersion = { campaignId:string; version:number; configuration:Record<string,unknown>; reason:string; effectiveAt:string; createdBy:string };

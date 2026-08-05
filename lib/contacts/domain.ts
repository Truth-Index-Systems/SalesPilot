import type { ContactConfidenceLabel, ContactEmailStatus, ContactLinkedInStatus, ContactReviewStatus } from "./schemas";

export type Contact = {
  id:string; organisationId:string; campaignId:string; companyId:string; contactDiscoverySessionId:string;
  fullName:string; roleTitle:string; department:string|null; location:string|null; reasonSelected:string;
  identityConfidence:number; roleConfidence:number; buyingRelevance:number; operationalRelevance:number;
  evidenceQuality:number; overallConfidence:number; confidenceLabel:ContactConfidenceLabel;
  emailAddress:string|null; emailStatus:ContactEmailStatus; emailConfidence:number; emailSourceUrl:string|null;
  linkedinProfileUrl:string|null; linkedinStatus:ContactLinkedInStatus; linkedinConfidence:number; linkedinSourceUrl:string|null;
  unknowns:string[]; riskFlags:string[]; reviewStatus:ContactReviewStatus; createdAt:string; updatedAt:string;
};
export type ContactDiscoverySessionStatus="QUEUED"|"RUNNING"|"COMPLETED"|"FAILED"|"CANCELLED";
export type ContactDiscoveryStage="PREPARING"|"RESEARCHING"|"IDENTIFYING"|"VALIDATING"|"SAVING"|"COMPLETE";

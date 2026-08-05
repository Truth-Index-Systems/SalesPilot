import assert from "node:assert/strict";
import { canTransition, deriveCampaignStage, noResultCooldownMinutes, retryDelayMinutes } from "./lib/stabilisation-s9-simulator.mjs";

assert.equal(canTransition("QUEUED", "RUNNING"), true);
assert.equal(canTransition("COMPLETED", "QUEUED"), false);
assert.equal(canTransition("FAILED_RETRYABLE", "QUEUED"), true);
assert.equal(canTransition("NO_RESULTS", "QUEUED"), false);

assert.deepEqual([1,2,3,4,5].map((n) => retryDelayMinutes(n, "NETWORK")), [1,5,30,120,null]);
assert.deepEqual([1,2,3].map((n) => retryDelayMinutes(n, "RATE_LIMIT")), [5,5,30]);
assert.deepEqual([0,1,2,3,4,10].map(noResultCooldownMinutes), [30,120,720,1440,1440,1440]);

const base = {
  campaignPaused:false,campaignArchived:false,businessAnalysisReady:true,campaignApproved:true,
  companyDiscoveryActive:false,companiesAwaitingReview:0,approvedCompanies:0,
  contactDiscoveryActive:false,contactsAwaitingReview:0,approvedReachableContacts:0,
  outreachStarted:false,repliesReceived:false,opportunitiesCreated:false,
};
assert.equal(deriveCampaignStage({...base,businessAnalysisReady:false}), "BUSINESS_ANALYSIS");
assert.equal(deriveCampaignStage({...base,campaignApproved:false}), "CAMPAIGN_REVIEW");
assert.equal(deriveCampaignStage({...base,companyDiscoveryActive:true}), "COMPANY_DISCOVERY");
assert.equal(deriveCampaignStage({...base,companiesAwaitingReview:2}), "COMPANY_REVIEW");
assert.equal(deriveCampaignStage({...base,approvedCompanies:1}), "CONTACT_DISCOVERY");
assert.equal(deriveCampaignStage({...base,contactsAwaitingReview:1}), "CONTACT_REVIEW");
assert.equal(deriveCampaignStage({...base,approvedReachableContacts:1}), "OUTREACH_READY");
assert.equal(deriveCampaignStage({...base,outreachStarted:true}), "OUTREACH");
assert.equal(deriveCampaignStage({...base,repliesReceived:true}), "REPLIES");
assert.equal(deriveCampaignStage({...base,opportunitiesCreated:true}), "OPPORTUNITIES");
assert.equal(deriveCampaignStage({...base,campaignPaused:true}), "PAUSED");
assert.equal(deriveCampaignStage({...base,campaignArchived:true}), "ARCHIVED");

console.log("S9 unit tests passed");

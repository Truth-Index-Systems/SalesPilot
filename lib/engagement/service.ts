import "server-only";
import {
  changeEngagementStatus,
  createEngagementFromOpportunity,
  getEngagement,
  getEngagementByOpportunity,
  listCampaignEngagements,
  listEngagementHistory,
  listEngagements,
  updateEngagement,
} from "./repository";
import { EngagementFiltersSchema, EngagementIdSchema, EngagementStatusSchema, EngagementUpdateSchema } from "./validators";
import type { EngagementFilters, EngagementStatus, EngagementUpdate } from "./types";

export const engagementService = {
  list(filters?: EngagementFilters) {
    return listEngagements(EngagementFiltersSchema.parse(filters ?? {}));
  },
  load(id: string) {
    return getEngagement(EngagementIdSchema.parse(id));
  },
  loadByOpportunity(opportunityId: string) {
    return getEngagementByOpportunity(EngagementIdSchema.parse(opportunityId));
  },
  listByCampaign(campaignId: string) {
    return listCampaignEngagements(EngagementIdSchema.parse(campaignId));
  },
  history(id: string) {
    return listEngagementHistory(EngagementIdSchema.parse(id));
  },
  create(opportunityId: string) {
    return createEngagementFromOpportunity(EngagementIdSchema.parse(opportunityId));
  },
  update(id: string, update: EngagementUpdate) {
    return updateEngagement(EngagementIdSchema.parse(id), EngagementUpdateSchema.parse(update));
  },
  changeStatus(id: string, status: EngagementStatus) {
    return changeEngagementStatus(EngagementIdSchema.parse(id), EngagementStatusSchema.parse(status));
  },
};

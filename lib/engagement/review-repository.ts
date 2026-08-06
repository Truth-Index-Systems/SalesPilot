import "server-only";
import { requireOrganisationContext } from "@/lib/auth/organisation-context";
import { databaseRequest } from "@/lib/database/postgrest";
import type { EngagementReviewOverview, HumanReviewAction, EngagementDraftEdit } from "./review-types";

export async function listEngagementReviewQueue(): Promise<EngagementReviewOverview[]> {
  const context = await requireOrganisationContext();
  return databaseRequest<EngagementReviewOverview[]>(`engagement_review_overview?organisation_id=eq.${context.organisationId}&status=in.(DRAFT_REVIEW,APPROVED_TO_SEND)&order=source_opportunity_rank.asc,updated_at.desc`);
}
export async function getEngagementReview(id: string): Promise<EngagementReviewOverview | null> {
  const context = await requireOrganisationContext();
  const rows = await databaseRequest<EngagementReviewOverview[]>(`engagement_review_overview?organisation_id=eq.${context.organisationId}&id=eq.${encodeURIComponent(id)}&limit=1`);
  return rows[0] ?? null;
}
export async function reviewEngagement(id: string, action: HumanReviewAction, note?: string, edit?: EngagementDraftEdit) {
  const context = await requireOrganisationContext();
  if (context.role === "VIEWER") throw new Error("ENGAGEMENT_REVIEW_FORBIDDEN");
  return databaseRequest("rpc/review_engagement_draft", { method: "POST", body: JSON.stringify({
    p_organisation_id: context.organisationId,p_engagement_id:id,p_user_id:context.userId,p_action:action,p_note:note??null,
    p_subject:edit?.subject??null,p_opening:edit?.opening??null,p_personalisation:edit?.personalisation??null,
    p_value_proposition:edit?.valueProposition??null,p_call_to_action:edit?.callToAction??null,
  })});
}
export async function bulkReviewEngagements(ids: string[], action: "APPROVED" | "REJECTED", note?: string) {
  const context = await requireOrganisationContext();
  if (context.role === "VIEWER") throw new Error("ENGAGEMENT_REVIEW_FORBIDDEN");
  return databaseRequest<number>("rpc/bulk_review_engagement_drafts", { method:"POST", body:JSON.stringify({p_organisation_id:context.organisationId,p_engagement_ids:ids,p_user_id:context.userId,p_action:action,p_note:note??null}) });
}

export async function recordEngagementExecution(id: string, action: "COPIED" | "OPENED" | "STARTED" | "COMPLETED" | "RESET", metadata?: Record<string, unknown>) {
  const context = await requireOrganisationContext();
  if (context.role === "VIEWER") throw new Error("ENGAGEMENT_EXECUTION_FORBIDDEN");
  return databaseRequest("rpc/record_engagement_execution", { method: "POST", body: JSON.stringify({
    p_organisation_id: context.organisationId, p_engagement_id: id, p_user_id: context.userId, p_action: action, p_metadata: metadata ?? {},
  }) });
}

export async function recordEngagementOutcome(id: string, outcome: "NO_RESPONSE" | "REPLIED" | "MEETING_BOOKED" | "QUALIFIED" | "WON" | "LOST", note?: string, outcomeValue?: number) {
  const context = await requireOrganisationContext();
  if (context.role === "VIEWER") throw new Error("ENGAGEMENT_OUTCOME_FORBIDDEN");
  return databaseRequest("rpc/record_engagement_outcome", { method: "POST", body: JSON.stringify({
    p_organisation_id: context.organisationId, p_engagement_id: id, p_user_id: context.userId, p_outcome: outcome, p_note: note ?? null, p_outcome_value: outcomeValue ?? null,
  }) });
}

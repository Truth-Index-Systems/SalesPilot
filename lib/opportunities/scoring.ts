import "server-only";
import type { OpportunityScoringSummary } from "./domain";

/**
 * CIE-R8 ERADICATED LEGACY AUTHORITY.
 *
 * The historical opportunity scorer is intentionally retained only as a named
 * fail-closed compatibility symbol so accidental reconnection cannot silently
 * restore pre-CIE commercial authority. It performs no calculation and makes
 * no database call.
 */
export async function scoreOpportunityIntelligenceShadow(
  _schedulerRunId: string,
): Promise<OpportunityScoringSummary> {
  throw new Error("CIE_R8_AUTHORITY_VIOLATION:LEGACY_OPPORTUNITY_SCORER_ERADICATED");
}

import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";
import { calculateAndPersistMrTi2Truth } from "@/lib/genesis-g8/truth-v2/production-hydration";
import { loadGenesisSellerContext } from "@/lib/integrations/genesis-t8/genesis-seller-context";
import {
  MARKETROUTE_FORENSIC_BUILD2_PRODUCER_VERSION,
  MARKETROUTE_FORENSIC_BUILD2_TRUTH_SEMANTICS,
  produceForensicBuild2CommercialReality,
  type ForensicBuild2SellerContext,
} from "./commercial-reality-producer";
import { persistForensicBuild2CommercialRealityProduction } from "./commercial-decision-runtime";

export type CieR4ProductionSummary = Readonly<{
  inspected: number;
  produced: number;
  candidates: number;
  researchRequired: number;
  rejected: number;
  held: number;
  missingTruthEntity: number;
  failed: number;
  materialChanges: number;
  stableRevalidations: number;
  r6Invalidated: number;
}>;

type OpportunityRow = Readonly<{ id: string; organisation_id: string; campaign_id: string; company_id: string }>;
type ProductionCandidateRow = Readonly<{ opportunity_id: string; organisation_id: string; campaign_id: string; company_id: string; revalidation_reason?: string | null }>;
type CompanyRow = Readonly<{ id: string; organisation_id: string; campaign_id: string; company_name: string; canonical_domain: string; industry: string | null; country: string | null }>;
type KnowledgeLinkRow = Readonly<{ genesis_g8_entity_id: string }>;
type EntityRow = Readonly<{ id: string }>;
type SnapshotRow = Readonly<{ id: string; entity_id: string; truth_semantics_version: string; calculated_at: string }>;

const EMPTY: CieR4ProductionSummary = Object.freeze({
  inspected: 0, produced: 0, candidates: 0, researchRequired: 0, rejected: 0, held: 0,
  missingTruthEntity: 0, failed: 0, materialChanges: 0, stableRevalidations: 0, r6Invalidated: 0,
});

async function resolveTargetTruthEntity(opportunity: OpportunityRow, company: CompanyRow): Promise<string | null> {
  const links = await databaseRequest<KnowledgeLinkRow[]>(
    `genesis_g8_campaign_knowledge_links?campaign_id=eq.${encodeURIComponent(opportunity.campaign_id)}&company_id=eq.${encodeURIComponent(opportunity.company_id)}&select=genesis_g8_entity_id&limit=1`,
  ).catch(() => []);
  if (links[0]?.genesis_g8_entity_id) return links[0].genesis_g8_entity_id;

  const canonicalDomain = company.canonical_domain?.trim().toLowerCase();
  if (!canonicalDomain) return null;
  const entities = await databaseRequest<EntityRow[]>(
    `genesis_g8_intelligence_entities?entity_type=eq.company&status=eq.ACTIVE&canonical_key=eq.${encodeURIComponent(canonicalDomain)}&select=id&limit=1`,
  ).catch(() => []);
  return entities[0]?.id ?? null;
}

async function tfr1SnapshotAt(entityId: string, referenceTime: string): Promise<SnapshotRow | null> {
  const rows = await databaseRequest<SnapshotRow[]>(
    `genesis_g8_truth_v2_snapshots?entity_id=eq.${encodeURIComponent(entityId)}&truth_semantics_version=eq.${encodeURIComponent(MARKETROUTE_FORENSIC_BUILD2_TRUTH_SEMANTICS)}&calculated_at=eq.${encodeURIComponent(referenceTime)}&select=id,entity_id,truth_semantics_version,calculated_at&order=created_at.desc&limit=1`,
  );
  return rows[0] ?? null;
}

/**
 * Build 3 production/revalidation worker. Candidate selection is state-aware:
 * missing authority, newer Truth, seller/constraint drift, or due temporal
 * validation. Exact trace changes are separated from material authority changes.
 */
export async function runCieR4CommercialRealityProduction(
  schedulerRunId: string,
  limit = 12,
): Promise<CieR4ProductionSummary> {
  const boundedLimit = Math.max(1, Math.min(25, Math.trunc(limit) || 12));
  const rows = await databaseRequest<ProductionCandidateRow[]>(
    "rpc/get_cie_r4_commercial_reality_revalidation_candidates",
    { method: "POST", body: JSON.stringify({ p_scheduler_run_id: schedulerRunId, p_limit: boundedLimit }) },
  );
  const candidatesList: readonly OpportunityRow[] = Object.freeze(rows.map((row) => Object.freeze({
    id: row.opportunity_id, organisation_id: row.organisation_id, campaign_id: row.campaign_id, company_id: row.company_id,
  })));
  if (!candidatesList.length) return EMPTY;

  let produced = 0, candidates = 0, researchRequired = 0, rejected = 0, held = 0;
  let missingTruthEntity = 0, failed = 0;
  let materialChanges = 0, stableRevalidations = 0, r6Invalidated = 0;

  for (const opportunity of candidatesList) {
    try {
      const companies = await databaseRequest<CompanyRow[]>(
        `companies?id=eq.${encodeURIComponent(opportunity.company_id)}&organisation_id=eq.${encodeURIComponent(opportunity.organisation_id)}&campaign_id=eq.${encodeURIComponent(opportunity.campaign_id)}&select=id,organisation_id,campaign_id,company_name,canonical_domain,industry,country&limit=1`,
      );
      const company = companies[0];
      if (!company) throw new Error("MR_FB2_COMPANY_NOT_FOUND_OR_SCOPE_MISMATCH");

      const sellerContext = await loadGenesisSellerContext(opportunity.campaign_id, opportunity.organisation_id);
      const targetTruthEntityId = await resolveTargetTruthEntity(opportunity, company);
      if (!targetTruthEntityId) { missingTruthEntity += 1; continue; }

      const referenceTime = new Date().toISOString();
      const targetTruth = await calculateAndPersistMrTi2Truth(targetTruthEntityId, { referenceTime });
      if (!targetTruth) { missingTruthEntity += 1; continue; }
      const snapshot = await tfr1SnapshotAt(targetTruthEntityId, referenceTime);
      if (!snapshot) throw new Error("MR_FB2_TFR1_SNAPSHOT_NOT_FOUND_AFTER_CALCULATION");

      const seller: ForensicBuild2SellerContext = Object.freeze({
        sellerEntityId: sellerContext.sellerIdentity.genesisEntityId,
        selectedCommercialObjectiveId: sellerContext.constraintSet.selectedCommercialObjectiveId,
        sellerContextFingerprint: sellerContext.provenance.sourceFingerprint,
        constraintFingerprint: sellerContext.constraintSet.constraintFingerprint,
        boundaryConstraints: sellerContext.constraintSet.boundaryConstraints,
        limitingConstraints: sellerContext.constraintSet.limitingConstraints,
      });
      const production = produceForensicBuild2CommercialReality({
        opportunityId: opportunity.id,
        targetTruthEntityId,
        targetTruthSnapshotId: snapshot.id,
        targetTruth,
        seller,
        targetFacts: Object.freeze({
          companyId: company.id,
          companyName: company.company_name,
          canonicalDomain: company.canonical_domain,
          industry: company.industry,
          country: company.country,
        }),
        referenceTime,
      });
      const persisted = await persistForensicBuild2CommercialRealityProduction(production, schedulerRunId);
      produced += 1;
      if (persisted.material_changed) materialChanges += 1; else stableRevalidations += 1;
      if (persisted.r6_invalidated) r6Invalidated += 1;
      if (production.decision.disposition === "COMMERCIAL_CANDIDATE") candidates += 1;
      else if (production.decision.disposition === "RESEARCH_REQUIRED") researchRequired += 1;
      else if (production.decision.disposition === "REJECT") rejected += 1;
      else held += 1;
    } catch (error) {
      failed += 1;
      console.error("CIE-R4 Build 3 commercial reality revalidation failed", { opportunityId: opportunity.id, error });
    }
  }

  return Object.freeze({
    inspected: candidatesList.length,
    produced,
    candidates,
    researchRequired,
    rejected,
    held,
    missingTruthEntity,
    failed,
    materialChanges,
    stableRevalidations,
    r6Invalidated,
  });
}

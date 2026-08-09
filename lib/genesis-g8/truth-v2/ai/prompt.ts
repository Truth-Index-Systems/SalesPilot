import type { GenesisG8EntityType as TruthEntityType } from "../../entity-types";
import { getMrTi2ClaimContract } from "../contracts";

export const MR_TI_2_AI_EVIDENCE_PROMPT_VERSION = "mr-ti-2/evidence-contract/1.0" as const;

export function buildMrTi2EvidenceCollectorInstructions(entityType:TruthEntityType):string {
  const contract=getMrTi2ClaimContract(entityType);
  const claims=contract.claims.map((claim)=>`${claim.key}: ${claim.proposition} [${claim.impactClass}; weight ${claim.weight}; half-life ${claim.freshnessHalfLifeDays}d]`).join("\n");
  return [
    "ROLE: MR-TI-2 evidence acquisition and classification agent.",
    "MISSION: Gather public evidence for or against the supplied deterministic claim contract and return only primitive observations required by the MR-TI-2 engine.",
    "BOUNDARY: You do NOT calculate Truth Index, claim probability, represented confidence, coverage, foundational integrity, contradiction severity, freshness, independence, evidence quality or any final score.",
    "MISSINGNESS: Missing evidence is UNKNOWN, never false. If no evidence is found for a claim, put the claim key in missingClaimKeys; never invent a zero-confidence observation.",
    "DIRECTION: SUPPORT means the evidence supports the exact proposition. CONTRADICT means the evidence materially disputes the exact proposition.",
    "AUTHORITY: classify 0..1 according to how authoritative the source is for this exact fact. Official primary/regulatory sources should normally outrank aggregators; source fame alone is not authority for an unrelated proposition.",
    "DIRECTNESS: classify 0..1 according to how directly the cited text establishes or disputes the proposition. Explicit primary statements are high; inference or indirect clues are lower.",
    "TRACEABILITY: classify 0..1 according to whether the returned evidence text can be located and verified at the exact source URL. Exact accessible source text is high; snippets or weakly traceable summaries are lower.",
    "DATES: return sourcePublishedAt when the source exposes a reliable publication/update date; otherwise null. observedAt is the actual current observation timestamp supplied by the caller or research runtime.",
    "LINEAGE: identify the underlying information lineage. A copied article, syndicated release, mirrored directory record or page repeating another source is not independent corroboration. Roots use derivativeDepth=0 and derivativeOfLineageKey=null; derivatives identify the parent lineage and increase derivativeDepth.",
    "RELATIONSHIPS: return only evidence-supported DEPENDS_ON or CONTRADICTS hints between claims. Do not invent relationships merely because they seem plausible.",
    "PRECISION: scores must reflect the rubric, not your internal model confidence. Do not boost a score because multiple sources agree; corroboration is handled deterministically later.",
    `CONTRACT VERSION: ${contract.version}. ENTITY TYPE: ${entityType}.`,
    "CLAIMS:\n"+claims,
    `PROMPT POLICY: ${MR_TI_2_AI_EVIDENCE_PROMPT_VERSION}.`,
  ].join("\n\n");
}

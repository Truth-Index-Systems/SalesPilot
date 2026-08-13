import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";
import { evaluateCieR5RouteAuthority } from "./route-authority";
import { evaluateCieR6ContactAuthority, type CieR6ContactCandidate } from "./contact-authority";
import {
  buildR5AuthoritySourceFingerprint,
  buildR5MaterialAuthorityFingerprint,
  buildR6AuthoritySourceFingerprintV5,
} from "./authority-lineage";

export type CieR6ApplySummary = Readonly<{ processed: number; ready: number; organisational: number; unresolved: number }>;

type Context = Readonly<{
  opportunity_id: string;
  reality_id: string;
  commercial_routes: unknown[] | null;
  contacts: unknown[] | null;
  r4_authority_fingerprint: string;
}>;

type RelationshipContext = Readonly<{ opportunity_id: string; canonical_relationships: unknown[] | null }>;

type ContactRow = Record<string, unknown>;

function n(value: unknown): number { const x=Number(value); return Number.isFinite(x) ? x : 0; }
function s(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }

function candidate(row: ContactRow): CieR6ContactCandidate | null {
  const contactId=s(row.id), fullName=s(row.full_name), roleTitle=s(row.role_title);
  if (!contactId || !fullName || !roleTitle) return null;
  return Object.freeze({
    contactId,
    fullName,
    roleTitle,
    department:s(row.department),
    emailAddress:s(row.email_address),
    emailStatus:s(row.email_status),
    linkedinProfileUrl:s(row.linkedin_profile_url),
    linkedinStatus:s(row.linkedin_status),
    reviewStatus:s(row.review_status),
    verifiedIdentityEvidence:n(row.verified_identity_evidence),
    verifiedRoleEvidence:n(row.verified_role_evidence),
  });
}

export async function runCieR6ContactAuthority(schedulerRunId: string): Promise<CieR6ApplySummary> {
  // Build 4: invalidate route authority first, then downstream contact authority.
  await databaseRequest("rpc/invalidate_stale_cie_r5_authority",{method:"POST",body:JSON.stringify({p_scheduler_run_id:schedulerRunId})});
  await databaseRequest("rpc/invalidate_stale_cie_r6_authority",{method:"POST",body:JSON.stringify({p_scheduler_run_id:schedulerRunId})});
  const [contexts,relationshipContexts]=await Promise.all([
    databaseRequest<Context[]>("rpc/get_cie_r6_contact_authority_context",{method:"POST",body:JSON.stringify({p_scheduler_run_id:schedulerRunId,p_limit:40})}),
    databaseRequest<RelationshipContext[]>("rpc/get_cie_r5_canonical_relationship_context",{method:"POST",body:JSON.stringify({p_scheduler_run_id:schedulerRunId})}),
  ]);
  const relationshipsByOpportunity=new Map(relationshipContexts.map((row)=>[row.opportunity_id,Array.isArray(row.canonical_relationships)?row.canonical_relationships:[]] as const));
  let processed=0, unresolved=0;
  for(const context of contexts){
    try{
      const routes=Array.isArray(context.commercial_routes)?context.commercial_routes:[];
      const relationships=relationshipsByOpportunity.get(context.opportunity_id)??[];
      const sourceSnapshot={opportunity:{commercial_routes:routes,canonical_relationships:relationships}};
      const routeAuthority=evaluateCieR5RouteAuthority({realityId:context.reality_id,commercialReasoning:{},sourceSnapshot});
      const r5SourceFingerprint=buildR5AuthoritySourceFingerprint({r4AuthorityFingerprint:context.r4_authority_fingerprint,routes,relationships});
      const r5AuthorityFingerprint=buildR5MaterialAuthorityFingerprint({r4AuthorityFingerprint:context.r4_authority_fingerprint,routeAuthority});

      await databaseRequest("rpc/persist_cie_r5_relationship_graph_decision",{
        method:"POST",body:JSON.stringify({
          p_opportunity_id:context.opportunity_id,
          p_parent_r4_authority_fingerprint:context.r4_authority_fingerprint,
          p_source_fingerprint:r5SourceFingerprint,
          p_authority_fingerprint:r5AuthorityFingerprint,
          p_selected_route_ids:routeAuthority.selectedRouteIds,
          p_route_states_json:routeAuthority.routeStates,
          p_relationship_states_json:routeAuthority.relationshipStates,
          p_path_provenance_json:routeAuthority.pathProvenance,
          p_strategy_json:routeAuthority.strategy,
          p_graph_assessment_json:routeAuthority.graphAssessment,
        }),
      });

      const contacts=(Array.isArray(context.contacts)?context.contacts:[]).map(value=>candidate((value??{}) as ContactRow)).filter((value):value is CieR6ContactCandidate=>value!==null);
      const decision=evaluateCieR6ContactAuthority({routeAuthority,routes:routes as any[],contacts});
      const sourceFingerprint=buildR6AuthoritySourceFingerprintV5({r5AuthorityFingerprint,contacts:Array.isArray(context.contacts)?context.contacts:[]});
      await databaseRequest("rpc/persist_cie_r6_contact_decision",{
        method:"POST",body:JSON.stringify({
          p_opportunity_id:context.opportunity_id,
          p_parent_r4_authority_fingerprint:context.r4_authority_fingerprint,
          p_parent_r5_authority_fingerprint:r5AuthorityFingerprint,
          p_source_fingerprint:sourceFingerprint,
          p_primary_contact_id:decision.primaryContactId,
          p_contact_frontier_json:decision.contactFrontier,
          p_bindings_json:decision.bindings,
          p_decision_json:decision,
        }),
      });
      processed++;
    }catch(error){
      const message=error instanceof Error?error.message:"CIE_R6_UNRESOLVED";
      if(message.includes("UNRESOLVED")||message.includes("NO_ROUTES")||message.includes("NO_STRUCTURAL_ROUTE")){ unresolved++; continue; }
      throw error;
    }
  }
  const applied=await databaseRequest<Array<{applied:number;ready:number;organisational:number}>>("rpc/apply_cie_r6_contact_authority",{method:"POST",body:"{}"});
  const summary=applied[0]??{applied:0,ready:0,organisational:0};
  return Object.freeze({processed,ready:Number(summary.ready)||0,organisational:Number(summary.organisational)||0,unresolved});
}

import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";
import { evaluateCieR5RouteAuthority } from "./route-authority";
import { evaluateCieR6ContactAuthority, type CieR6ContactCandidate } from "./contact-authority";
import { buildR6AuthoritySourceFingerprint } from "./authority-lineage";

export type CieR6ApplySummary = Readonly<{ processed: number; ready: number; organisational: number; unresolved: number }>;

type Context = Readonly<{
  opportunity_id: string;
  reality_id: string;
  commercial_routes: unknown[] | null;
  contacts: unknown[] | null;
  r4_authority_fingerprint: string;
}>;

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
  // Fail closed before recomputation: source or parent-authority drift removes READY immediately.
  await databaseRequest("rpc/invalidate_stale_cie_r6_authority",{method:"POST",body:JSON.stringify({p_scheduler_run_id:schedulerRunId})});
  const contexts=await databaseRequest<Context[]>("rpc/get_cie_r6_contact_authority_context",{
    method:"POST",body:JSON.stringify({p_scheduler_run_id:schedulerRunId,p_limit:40}),
  });
  let processed=0, unresolved=0;
  for(const context of contexts){
    try{
      const routes=Array.isArray(context.commercial_routes)?context.commercial_routes:[];
      const sourceSnapshot={opportunity:{commercial_routes:routes}};
      const routeAuthority=evaluateCieR5RouteAuthority({realityId:context.reality_id,commercialReasoning:{},sourceSnapshot});
      const contacts=(Array.isArray(context.contacts)?context.contacts:[]).map(value=>candidate((value??{}) as ContactRow)).filter((value):value is CieR6ContactCandidate=>value!==null);
      const decision=evaluateCieR6ContactAuthority({routeAuthority,routes:routes as any[],contacts});
      const sourceFingerprint=buildR6AuthoritySourceFingerprint({r4AuthorityFingerprint:context.r4_authority_fingerprint,routes,contacts:Array.isArray(context.contacts)?context.contacts:[]});
      await databaseRequest("rpc/persist_cie_r6_contact_decision",{
        method:"POST",body:JSON.stringify({
          p_opportunity_id:context.opportunity_id,
          p_parent_r4_authority_fingerprint:context.r4_authority_fingerprint,
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

import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";
import type { MrTi2EntityTruthResult } from "@/lib/genesis-g8/truth-v2/entity/types";

// Forensic Build 7: founder-facing authority metrics are read only from the
// canonical current Truth and R4->R5->R6 read models. Historical authority
// ledgers are not counted directly.
type EntityRow={id:string;entity_type:string;display_name:string|null;canonical_key:string;status:string;created_at:string};
type CurrentTruthRow={entity_id:string;display_name:string|null;canonical_key:string;truth_snapshot_id:string;truth_semantics_version:string;truth_index:number;coverage:number;evidence_sufficiency:number|null;review_state:string;probability_state:string|null;result_json:MrTi2EntityTruthResult;calculated_at:string};
type AuthorityRow={id:string;primary_contact_id:string|null;authority_state:string;authority_ready:boolean;authority_current:boolean;workflow_authority_mismatch:boolean;r4_current:boolean;r5_current:boolean;r6_current:boolean;r4_reality_state:string|null;r4_disposition:string|null;r6_contact_frontier_json:unknown;r6_bindings_json:unknown;active_research_count:number;latest_invalidation_layer:string|null;latest_invalidation_reason:string|null;latest_invalidation_at:string|null};
type R7Row={repair_id:string;opportunity_id:string;claim_key:string;impact_class:string;impact_precedence:number;order_index:number;status:string;directive_json:Record<string,unknown>;created_at:string;updated_at:string};
type RepairRow={id:string;status:string;blocking_mode:string;company_id:string|null;claim_key:string;objective:string;updated_at:string};
type WorkJobRow={id:string;status:string;created_at:string;updated_at:string;completed_at:string|null;last_error:string|null;contacts_persisted?:number;routes_persisted?:number;companies_persisted?:number};
type EvidenceTodayRow={id:string;created_at:string};
type TruthTodayRow={entity_id:string;calculated_at:string};

const safeArray=(value:unknown):unknown[]=>Array.isArray(value)?value:[];
const n=(value:unknown)=>Number.isFinite(Number(value))?Number(value):0;

export interface CieFounderCommandCentre {
  researchDensity:{companies:number;average:number;bands:{complete:number;high:number;medium:number;low:number;unmeasured:number};claims:{represented:number;missing:number;contradicted:number;dependencyConstrained:number}};
  truthHealth:{auto:number;verify:number;humanReview:number;averageTruth:number;averageSufficiency:number;uncalibrated:number;partiallyCalibrated:number;empiricallyCalibrated:number};
  realities:{total:number;states:Record<string,number>;dispositions:Record<string,number>;current:number;staleCommercial:number};
  reachability:{authoritativeDecisions:number;ready:number;namedContact:number;organisational:number;multiContactFrontier:number;awaitingBinding:number;routeStale:number;contactStale:number};
  authorityIntegrity:{opportunities:number;current:number;ready:number;stale:number;workflowMismatches:number;awaitingCommercialReality:number;researchRequired:number;routeUnresolved:number;contactUnresolved:number;latestInvalidations:ReadonlyArray<{layer:string;reason:string;occurredAt:string}>};
  research:{active:number;retired:number;decisionBlocking:number;decisionSharpening:number;stabilityRelevant:number;assuranceRelevant:number;enrichment:number;queuedRepairs:number;activeRepairs:number;top:ReadonlyArray<{claimKey:string;impactClass:string;objective:string;opportunityId:string}>};
  companies:ReadonlyArray<{entityId:string;name:string;coverage:number;truthIndex:number;sufficiency:number;reviewState:string;probabilityState:string;missing:number;contradicted:number}>;
  queueHealth:{depth:Record<string,number>;expansion:Record<string,number>;depthFailuresToday:number;expansionFailuresToday:number};
  throughput:{companiesToday:number;contactsToday:number;routesToday:number;evidenceToday:number;truthSnapshotsToday:number;depthCompletedToday:number;expansionCompletedToday:number};
  recentDiscoveries:ReadonlyArray<{id:string;kind:string;label:string;occurredAt:string}>;
}

export async function getCieFounderCommandCentre():Promise<CieFounderCommandCentre>{
  const today=new Date(); today.setUTCHours(0,0,0,0); const todayIso=today.toISOString();
  const [entities,currentTruth,authorityRows,r7,repairs,depthJobs,expansionJobs,recentEntities,evidenceToday,truthToday]=await Promise.all([
    databaseRequest<EntityRow[]>("genesis_g8_intelligence_entities?select=id,entity_type,display_name,canonical_key,status,created_at&entity_type=eq.company&status=eq.ACTIVE&limit=10000").catch(()=>[]),
    databaseRequest<CurrentTruthRow[]>("cie_current_company_truth_read?select=entity_id,display_name,canonical_key,truth_snapshot_id,truth_semantics_version,truth_index,coverage,evidence_sufficiency,review_state,probability_state,result_json,calculated_at&limit=10000").catch(()=>[]),
    databaseRequest<AuthorityRow[]>("cie_authoritative_opportunity_read?select=id,primary_contact_id,authority_state,authority_ready,authority_current,workflow_authority_mismatch,r4_current,r5_current,r6_current,r4_reality_state,r4_disposition,r6_contact_frontier_json,r6_bindings_json,active_research_count,latest_invalidation_layer,latest_invalidation_reason,latest_invalidation_at&limit=10000").catch(()=>[]),
    databaseRequest<R7Row[]>("cie_r7_research_directives?select=repair_id,opportunity_id,claim_key,impact_class,impact_precedence,order_index,status,directive_json,created_at,updated_at&order=impact_precedence.desc,order_index.asc&limit=10000").catch(()=>[]),
    databaseRequest<RepairRow[]>("genesis_g8_discovery_repair_queue?select=id,status,blocking_mode,company_id,claim_key,objective,updated_at&status=in.(QUEUED,CLAIMED)&limit=10000").catch(()=>[]),
    databaseRequest<WorkJobRow[]>("genesis_g82_depth_jobs?select=id,status,created_at,updated_at,completed_at,last_error,contacts_persisted,routes_persisted&limit=10000").catch(()=>[]),
    databaseRequest<WorkJobRow[]>("genesis_g82_expansion_jobs?select=id,status,created_at,updated_at,completed_at,last_error,companies_persisted,contacts_persisted,routes_persisted&limit=10000").catch(()=>[]),
    databaseRequest<EntityRow[]>(`genesis_g8_intelligence_entities?select=id,entity_type,display_name,canonical_key,status,created_at&created_at=gte.${encodeURIComponent(todayIso)}&order=created_at.desc&limit=20`).catch(()=>[]),
    databaseRequest<EvidenceTodayRow[]>(`genesis_g8_intelligence_evidence?select=id,created_at&created_at=gte.${encodeURIComponent(todayIso)}&limit=10000`).catch(()=>[]),
    databaseRequest<TruthTodayRow[]>(`genesis_g8_truth_v2_snapshots?select=entity_id,calculated_at&truth_semantics_version=eq.MR-TI-2-TFR1&calculated_at=gte.${encodeURIComponent(todayIso)}&limit=10000`).catch(()=>[]),
  ]);

  const truthMap=new Map(currentTruth.map(row=>[row.entity_id,row] as const));
  let represented=0,missing=0,contradicted=0,dependencyConstrained=0;
  const companyRows=entities.map(entity=>{
    const row=truthMap.get(entity.id); const diagnostics=row?.result_json?.diagnostics;
    if(row){
      represented+=safeArray(diagnostics?.contributions).filter(value=>!!value&&typeof value==="object"&&(value as {represented?:unknown}).represented===true).length;
      missing+=safeArray(diagnostics?.missingClaims).length;
      contradicted+=safeArray(diagnostics?.contradictedClaims).length;
      dependencyConstrained+=safeArray(diagnostics?.dependencyConstrainedClaims).length;
    }
    return {entityId:entity.id,name:entity.display_name??entity.canonical_key,coverage:n(row?.coverage),truthIndex:n(row?.truth_index),sufficiency:n(row?.evidence_sufficiency),reviewState:row?.review_state??"UNMEASURED",probabilityState:row?.probability_state??"UNCALIBRATED",missing:safeArray(diagnostics?.missingClaims).length,contradicted:safeArray(diagnostics?.contradictedClaims).length};
  }).sort((a,b)=>b.coverage-a.coverage||b.truthIndex-a.truthIndex||a.name.localeCompare(b.name));
  const measured=companyRows.filter(row=>row.reviewState!=="UNMEASURED");
  const avg=(values:number[])=>values.length?values.reduce((a,b)=>a+b,0)/values.length:0;
  const bands={complete:measured.filter(r=>r.coverage>=99.5).length,high:measured.filter(r=>r.coverage>=80&&r.coverage<99.5).length,medium:measured.filter(r=>r.coverage>=60&&r.coverage<80).length,low:measured.filter(r=>r.coverage<60).length,unmeasured:companyRows.length-measured.length};

  const currentR4=authorityRows.filter(row=>row.r4_current&&row.r4_reality_state&&row.r4_disposition);
  const states:Record<string,number>={},dispositions:Record<string,number>={};
  for(const row of currentR4){states[row.r4_reality_state!]=(states[row.r4_reality_state!]??0)+1;dispositions[row.r4_disposition!]=(dispositions[row.r4_disposition!]??0)+1;}
  const readyRows=authorityRows.filter(row=>row.authority_ready);
  let namedContact=0,organisational=0,multiContactFrontier=0;
  for(const row of readyRows){
    const bindings=safeArray(row.r6_bindings_json) as Array<Record<string,unknown>>;
    if(row.primary_contact_id) namedContact++;
    if(!row.primary_contact_id || bindings.some(b=>b.mode==="ORGANISATIONAL_ROUTE")) organisational++;
    if(safeArray(row.r6_contact_frontier_json).length>1) multiContactFrontier++;
  }

  const active=r7.filter(r=>r.status==="ACTIVE");
  const impact=(key:string)=>active.filter(r=>r.impact_class===key).length;
  const repairMap=new Map(repairs.map(r=>[r.id,r] as const));
  const top=active.slice().sort((a,b)=>b.impact_precedence-a.impact_precedence||a.order_index-b.order_index).slice(0,8).map(row=>({claimKey:row.claim_key,impactClass:row.impact_class,objective:repairMap.get(row.repair_id)?.objective??"Decision-relevant research",opportunityId:row.opportunity_id}));
  const countByStatus=(rows:WorkJobRow[])=>rows.reduce<Record<string,number>>((acc,row)=>{acc[row.status]=(acc[row.status]??0)+1;return acc;},{});
  const completedToday=(rows:WorkJobRow[])=>rows.filter(row=>row.status==="COMPLETED"&&!!row.completed_at&&row.completed_at>=todayIso).length;
  const failuresToday=(rows:WorkJobRow[])=>rows.filter(row=>row.status==="FAILED"&&row.updated_at>=todayIso).length;
  const recentDiscoveries=recentEntities.map(row=>({id:row.id,kind:row.entity_type.toUpperCase(),label:row.display_name??row.canonical_key,occurredAt:row.created_at}));
  const throughput={companiesToday:recentEntities.filter(r=>r.entity_type==="company").length,contactsToday:recentEntities.filter(r=>r.entity_type==="contact").length,routesToday:recentEntities.filter(r=>r.entity_type==="route").length,evidenceToday:evidenceToday.length,truthSnapshotsToday:truthToday.length,depthCompletedToday:completedToday(depthJobs),expansionCompletedToday:completedToday(expansionJobs)};
  const staleStates=new Set(["COMMERCIAL_AUTHORITY_STALE","ROUTE_STALE","CONTACT_STALE"]);
  const latestInvalidations=authorityRows.filter(row=>row.latest_invalidation_at&&row.latest_invalidation_reason&&row.latest_invalidation_layer).sort((a,b)=>String(b.latest_invalidation_at).localeCompare(String(a.latest_invalidation_at))).slice(0,6).map(row=>({layer:row.latest_invalidation_layer!,reason:row.latest_invalidation_reason!,occurredAt:row.latest_invalidation_at!}));

  return {
    researchDensity:{companies:companyRows.length,average:avg(measured.map(r=>r.coverage)),bands,claims:{represented,missing,contradicted,dependencyConstrained}},
    truthHealth:{auto:measured.filter(r=>r.reviewState==="AUTO").length,verify:measured.filter(r=>r.reviewState==="VERIFY").length,humanReview:measured.filter(r=>r.reviewState==="HUMAN_REVIEW_REQUIRED").length,averageTruth:avg(measured.map(r=>r.truthIndex)),averageSufficiency:avg(measured.map(r=>r.sufficiency)),uncalibrated:measured.filter(r=>r.probabilityState==="UNCALIBRATED").length,partiallyCalibrated:measured.filter(r=>r.probabilityState==="PARTIALLY_CALIBRATED").length,empiricallyCalibrated:measured.filter(r=>r.probabilityState==="EMPIRICALLY_CALIBRATED").length},
    realities:{total:currentR4.length,states,dispositions,current:currentR4.length,staleCommercial:authorityRows.filter(r=>r.authority_state==="COMMERCIAL_AUTHORITY_STALE").length},
    reachability:{authoritativeDecisions:authorityRows.filter(r=>r.r6_current).length,ready:readyRows.length,namedContact,organisational,multiContactFrontier,awaitingBinding:authorityRows.filter(r=>r.r4_current&&r.r4_disposition==="COMMERCIAL_CANDIDATE"&&!r.authority_ready).length,routeStale:authorityRows.filter(r=>r.authority_state==="ROUTE_STALE").length,contactStale:authorityRows.filter(r=>r.authority_state==="CONTACT_STALE").length},
    authorityIntegrity:{opportunities:authorityRows.length,current:authorityRows.filter(r=>r.authority_current).length,ready:readyRows.length,stale:authorityRows.filter(r=>staleStates.has(r.authority_state)).length,workflowMismatches:authorityRows.filter(r=>r.workflow_authority_mismatch).length,awaitingCommercialReality:authorityRows.filter(r=>r.authority_state==="AWAITING_COMMERCIAL_REALITY").length,researchRequired:authorityRows.filter(r=>r.authority_state==="RESEARCH_REQUIRED").length,routeUnresolved:authorityRows.filter(r=>r.authority_state==="ROUTE_UNRESOLVED").length,contactUnresolved:authorityRows.filter(r=>r.authority_state==="CONTACT_UNRESOLVED").length,latestInvalidations},
    research:{active:active.length,retired:r7.filter(r=>r.status==="RETIRED").length,decisionBlocking:impact("DECISION_BLOCKING"),decisionSharpening:impact("DECISION_SHARPENING"),stabilityRelevant:impact("STABILITY_RELEVANT"),assuranceRelevant:impact("ASSURANCE_RELEVANT"),enrichment:impact("ENRICHMENT"),queuedRepairs:repairs.filter(r=>r.status==="QUEUED").length,activeRepairs:repairs.filter(r=>r.status==="CLAIMED").length,top},
    companies:companyRows.slice(0,12),
    queueHealth:{depth:countByStatus(depthJobs),expansion:countByStatus(expansionJobs),depthFailuresToday:failuresToday(depthJobs),expansionFailuresToday:failuresToday(expansionJobs)},
    throughput,recentDiscoveries,
  };
}

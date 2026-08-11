import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";
import type { MrTi2EntityTruthResult } from "@/lib/genesis-g8/truth-v2/entity/types";

type EntityRow={id:string;entity_type:string;display_name:string|null;canonical_key:string;status:string};
type SnapshotRow={entity_id:string;truth_index:number;represented_confidence:number;coverage:number;review_state:string;result_json:MrTi2EntityTruthResult;calculated_at:string};
type R4Row={opportunity_id:string;reality_id:string;reality_state:string;disposition:string;decision_json:Record<string,unknown>;applied_at:string|null;updated_at:string};
type R6Row={opportunity_id:string;primary_contact_id:string|null;contact_frontier_json:unknown;bindings_json:unknown;decision_json:Record<string,unknown>;applied_at:string|null;updated_at:string};
type R7Row={repair_id:string;opportunity_id:string;claim_key:string;impact_class:string;impact_precedence:number;order_index:number;status:string;directive_json:Record<string,unknown>;created_at:string;updated_at:string};
type RepairRow={id:string;status:string;blocking_mode:string;company_id:string|null;claim_key:string;objective:string;updated_at:string};

const safeArray=(value:unknown):unknown[]=>Array.isArray(value)?value:[];
const n=(value:unknown)=>Number.isFinite(Number(value))?Number(value):0;

export interface CieFounderCommandCentre {
  researchDensity:{companies:number;average:number;bands:{complete:number;high:number;medium:number;low:number;unmeasured:number};claims:{represented:number;missing:number;contradicted:number;dependencyConstrained:number}};
  truthHealth:{auto:number;verify:number;humanReview:number;averageTruth:number;averageConfidence:number};
  realities:{total:number;states:Record<string,number>;dispositions:Record<string,number>;applied:number};
  reachability:{authoritativeDecisions:number;ready:number;namedContact:number;organisational:number;multiContactFrontier:number;awaitingBinding:number};
  research:{active:number;retired:number;decisionBlocking:number;decisionSharpening:number;stabilityRelevant:number;assuranceRelevant:number;enrichment:number;queuedRepairs:number;activeRepairs:number;top:ReadonlyArray<{claimKey:string;impactClass:string;objective:string;opportunityId:string}>};
  companies:ReadonlyArray<{entityId:string;name:string;coverage:number;truthIndex:number;confidence:number;reviewState:string;missing:number;contradicted:number}>;
}

export async function getCieFounderCommandCentre():Promise<CieFounderCommandCentre>{
  const [entities,snapshots,r4,r6,r7,repairs]=await Promise.all([
    databaseRequest<EntityRow[]>("genesis_g8_intelligence_entities?select=id,entity_type,display_name,canonical_key,status&entity_type=eq.company&status=eq.ACTIVE&limit=10000").catch(()=>[]),
    databaseRequest<SnapshotRow[]>("genesis_g8_truth_v2_snapshots?select=entity_id,truth_index,represented_confidence,coverage,review_state,result_json,calculated_at&order=calculated_at.desc&limit=20000").catch(()=>[]),
    databaseRequest<R4Row[]>("cie_r4_commercial_decisions?select=opportunity_id,reality_id,reality_state,disposition,decision_json,applied_at,updated_at&order=updated_at.desc&limit=10000").catch(()=>[]),
    databaseRequest<R6Row[]>("cie_r6_contact_decisions?select=opportunity_id,primary_contact_id,contact_frontier_json,bindings_json,decision_json,applied_at,updated_at&order=updated_at.desc&limit=10000").catch(()=>[]),
    databaseRequest<R7Row[]>("cie_r7_research_directives?select=repair_id,opportunity_id,claim_key,impact_class,impact_precedence,order_index,status,directive_json,created_at,updated_at&order=impact_precedence.desc,order_index.asc&limit=10000").catch(()=>[]),
    databaseRequest<RepairRow[]>("genesis_g8_discovery_repair_queue?select=id,status,blocking_mode,company_id,claim_key,objective,updated_at&status=in.(QUEUED,CLAIMED)&limit=10000").catch(()=>[]),
  ]);
  const entityMap=new Map(entities.map(e=>[e.id,e] as const));
  const latest=new Map<string,SnapshotRow>();
  for(const row of snapshots) if(entityMap.has(row.entity_id)&&!latest.has(row.entity_id)) latest.set(row.entity_id,row);
  let represented=0,missing=0,contradicted=0,dependencyConstrained=0;
  const companyRows=[...entityMap.values()].map(entity=>{
    const row=latest.get(entity.id);
    const diagnostics=row?.result_json?.diagnostics;
    if(row){
      represented+=safeArray(diagnostics?.contributions).filter(value=>!!value&&typeof value==="object"&&(value as {represented?:unknown}).represented===true).length;
      missing+=safeArray(diagnostics?.missingClaims).length;
      contradicted+=safeArray(diagnostics?.contradictedClaims).length;
      dependencyConstrained+=safeArray(diagnostics?.dependencyConstrainedClaims).length;
    }
    return {entityId:entity.id,name:entity.display_name??entity.canonical_key,coverage:n(row?.coverage),truthIndex:n(row?.truth_index),confidence:n(row?.represented_confidence),reviewState:row?.review_state??"UNMEASURED",missing:safeArray(diagnostics?.missingClaims).length,contradicted:safeArray(diagnostics?.contradictedClaims).length};
  }).sort((a,b)=>b.coverage-a.coverage||b.truthIndex-a.truthIndex||a.name.localeCompare(b.name));
  const measured=companyRows.filter(row=>row.reviewState!=="UNMEASURED");
  const avg=(values:number[])=>values.length?values.reduce((a,b)=>a+b,0)/values.length:0;
  const bands={complete:measured.filter(r=>r.coverage>=99.5).length,high:measured.filter(r=>r.coverage>=80&&r.coverage<99.5).length,medium:measured.filter(r=>r.coverage>=60&&r.coverage<80).length,low:measured.filter(r=>r.coverage<60).length,unmeasured:companyRows.length-measured.length};
  const states:Record<string,number>={},dispositions:Record<string,number>={};
  for(const row of r4){states[row.reality_state]=(states[row.reality_state]??0)+1;dispositions[row.disposition]=(dispositions[row.disposition]??0)+1;}
  let namedContact=0,organisational=0,multiContactFrontier=0;
  for(const row of r6){
    const bindings=safeArray(row.bindings_json) as Array<Record<string,unknown>>;
    if(row.primary_contact_id) namedContact++;
    if(bindings.some(b=>b.mode==="ORGANISATIONAL_ROUTE")) organisational++;
    if(safeArray(row.contact_frontier_json).length>1) multiContactFrontier++;
  }
  const active=r7.filter(r=>r.status==="ACTIVE");
  const impact=(key:string)=>active.filter(r=>r.impact_class===key).length;
  const repairMap=new Map(repairs.map(r=>[r.id,r] as const));
  const top=active.slice().sort((a,b)=>b.impact_precedence-a.impact_precedence||a.order_index-b.order_index).slice(0,8).map(row=>({claimKey:row.claim_key,impactClass:row.impact_class,objective:repairMap.get(row.repair_id)?.objective??"Decision-relevant research",opportunityId:row.opportunity_id}));
  return {
    researchDensity:{companies:companyRows.length,average:avg(measured.map(r=>r.coverage)),bands,claims:{represented,missing,contradicted,dependencyConstrained}},
    truthHealth:{auto:measured.filter(r=>r.reviewState==="AUTO").length,verify:measured.filter(r=>r.reviewState==="VERIFY").length,humanReview:measured.filter(r=>r.reviewState==="HUMAN_REVIEW_REQUIRED").length,averageTruth:avg(measured.map(r=>r.truthIndex)),averageConfidence:avg(measured.map(r=>r.confidence))},
    realities:{total:r4.length,states,dispositions,applied:r4.filter(r=>!!r.applied_at).length},
    reachability:{authoritativeDecisions:r6.length,ready:r6.filter(r=>!!r.applied_at).length,namedContact,organisational,multiContactFrontier,awaitingBinding:Math.max(0,r4.filter(r=>r.disposition==="COMMERCIAL_CANDIDATE").length-r6.length)},
    research:{active:active.length,retired:r7.filter(r=>r.status==="RETIRED").length,decisionBlocking:impact("DECISION_BLOCKING"),decisionSharpening:impact("DECISION_SHARPENING"),stabilityRelevant:impact("STABILITY_RELEVANT"),assuranceRelevant:impact("ASSURANCE_RELEVANT"),enrichment:impact("ENRICHMENT"),queuedRepairs:repairs.filter(r=>r.status==="QUEUED").length,activeRepairs:repairs.filter(r=>r.status==="CLAIMED").length,top},
    companies:companyRows.slice(0,12),
  };
}

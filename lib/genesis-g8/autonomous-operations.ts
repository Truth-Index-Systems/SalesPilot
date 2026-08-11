import "server-only";

import { databaseRequest } from "@/lib/database/postgrest";
import { runGenesisG8DiscoveryAcquisitionWorker } from "./discovery-acquisition-worker";
import { runGenesisG8RepairReplanWorker } from "./repair-replanning";
import { runGenesisG8DiscoveryRepairWorker } from "./discovery-repair-worker";
import { runGenesisG8IntelligentBackgroundRefresh } from "./background-refresh";
import { decideGenesisG8Capacity, readGenesisG8CapacitySnapshot, GENESIS_G8_CAPACITY_BUDGET_VERSION } from "./capacity-budget";
import { runGenesisG82AutonomousExpansionWorker } from "./autonomous-expansion-worker";
import { ensureGenesisG82DepthBacklog, runGenesisG82DepthWorker } from "./autonomous-depth-worker";
import { reconcileMissingMrTi2Snapshots } from "./truth-v2/reconciliation";

export const GENESIS_G82_AUTONOMOUS_OPERATIONS_VERSION="G8.2-CAPACITY-BACKPRESSURE-OPERATIONS-1.2" as const;

async function safe<T>(name:string,fn:()=>Promise<T>):Promise<{name:string;ok:true;result:T}|{name:string;ok:false;error:string}>{
  try{return {name,ok:true,result:await fn()};}catch(error){return {name,ok:false,error:error instanceof Error?error.message:String(error)};}
}

export async function runGenesisG82AutonomousOperations(){
  // Free/deterministic queue consumers go first so persisted customer Discovery
  // reaches Knowledge and completed repairs are replanned even when AI capacity is tight.
  const acquisition=await safe("acquisition",()=>runGenesisG8DiscoveryAcquisitionWorker(10));
  const replans=await safe("replans",()=>runGenesisG8RepairReplanWorker(4));
  // Build 8.1: reconcile active entities created by an earlier deployment/run that have no MR-TI-2 snapshot.
  // This is bounded, deterministic and performs no AI calls; it also backfills V2 primitive assessments from persisted evidence.
  const truthV2Reconciliation=await safe("truthV2Reconciliation",()=>reconcileMissingMrTi2Snapshots(8));

  // Queue creation is deterministic/free and must not be hidden behind an AI budget gate.
  // This makes scheduling health observable even when governed AI capacity is temporarily zero.
  const depthBacklog=await safe("depthBacklog",()=>ensureGenesisG82DepthBacklog(50));

  const snapshot=await readGenesisG8CapacitySnapshot();
  const capacity=decideGenesisG8Capacity(snapshot);

  // Existing exact repair work retains precedence. claim_genesis_g8_discovery_repairs
  // itself orders blocking/customer-critical intelligence before non-blocking work.
  const repairs=capacity.mode==="PAUSED"
    ? {name:"repairs",ok:true as const,result:null}
    : await safe("repairs",()=>runGenesisG8DiscoveryRepairWorker(capacity.mode==="CUSTOMER_ONLY"?2:1));

  let refresh:{name:string;ok:boolean;result?:unknown;error?:string}|null=null;
  let expansion:{name:string;ok:boolean;result?:unknown;error?:string}|null=null;
  let depth:{name:string;ok:boolean;result?:unknown;error?:string}|null=null;

  // Existing-company depth is more valuable than acquiring another breadth-only company.
  // It receives its own governed gate and runs first whenever background capacity exists.
  // CUSTOMER_ONLY and PAUSED still block it, so live customer work remains authoritative.
  const mayDepth=(capacity.mode==="NORMAL"||capacity.mode==="CONSERVATIVE")&&capacity.maximumBackgroundRepairs>0;
  if(mayDepth){
    depth=await safe("depth",()=>runGenesisG82DepthWorker(2));
  }

  // New breadth remains stricter: it must also have no pending live-customer work.
  const mayGrow=(capacity.mode==="NORMAL"||capacity.mode==="CONSERVATIVE")&&!capacity.snapshot.liveCustomerWorkPending&&capacity.maximumBackgroundRepairs>0;
  if(mayGrow){
    // Keep refresh cheap: it only schedules exact R9 repairs and does not call AI itself.
    refresh=await safe("refresh",()=>runGenesisG8IntelligentBackgroundRefresh({limit:capacity.mode==="CONSERVATIVE"?1:2}));
    // Breadth runs after depth. AI governance remains the hard spend authority and will
    // defer this call if the preceding depth work consumed the currently available slot.
    expansion=await safe("expansion",()=>runGenesisG82AutonomousExpansionWorker(2));
  }

  await databaseRequest("rpc/record_genesis_g8_capacity_budget_event",{
    method:"POST",body:JSON.stringify({
      p_budget_version:GENESIS_G8_CAPACITY_BUDGET_VERSION,p_mode:capacity.mode,p_capacity_used_ratio:capacity.capacityUsedRatio,
      p_background_budget_usd:capacity.backgroundBudgetUsd,p_background_spent_usd:capacity.backgroundSpentUsd,
      p_maximum_background_repairs:capacity.maximumBackgroundRepairs,p_truth_gain_today:capacity.snapshot.truthGainToday,
      p_truth_gain_per_repair_call:capacity.snapshot.truthGainPerRepairCall,
      p_detail:{
        operationsVersion:GENESIS_G82_AUTONOMOUS_OPERATIONS_VERSION,
        allocation:capacity.allocation,reasons:capacity.reasons,mayDepth,mayGrow,
        acquisitionOk:acquisition.ok,replansOk:replans.ok,truthV2ReconciliationOk:truthV2Reconciliation.ok,depthBacklogOk:depthBacklog.ok,repairsOk:repairs.ok,refreshOk:refresh?.ok??null,expansionOk:expansion?.ok??null,depthOk:depth?.ok??null,
      },
    }),
  }).catch(()=>undefined);

  const failures=[acquisition,replans,truthV2Reconciliation,depthBacklog,repairs,refresh,expansion,depth].filter(Boolean).filter((x:any)=>x.ok===false);
  return {operationsVersion:GENESIS_G82_AUTONOMOUS_OPERATIONS_VERSION,capacity,mayDepth,mayGrow,acquisition,replans,truthV2Reconciliation,depthBacklog,repairs,refresh,expansion,depth,ok:failures.length===0,failures};
}

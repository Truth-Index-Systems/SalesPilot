"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "@/components/icons";
import { isJobActive, isJobRetryScheduled, isJobRunning, jobStateLabel, resolvePersistedJobState } from "@/lib/pipeline/presentation";

type Activity={id:string;title:string;description?:string|null;occurred_at:string};
type Discovery={status:string;job_state?:string|null;stage:string;progress:number;recommendations_saved:number;next_retry_at?:string|null};

function snapshot(discovery:Discovery|null,activities:Activity[],companyCount:number){
 return JSON.stringify({
  status:discovery?.status??null,
  jobState:discovery?.job_state??null,
  stage:discovery?.stage??null,
  progress:discovery?.progress??null,
  saved:discovery?.recommendations_saved??null,
  retry:discovery?.next_retry_at??null,
  companyCount,
  activities:activities.slice(0,8).map(item=>[item.id,item.title,item.occurred_at]),
 });
}

export function DiscoveryActivityTicker({campaignId,initialDiscovery,initialActivities,initialCompanyCount}:{campaignId:string;initialDiscovery:Discovery|null;initialActivities:Activity[];initialCompanyCount:number}){
 const router=useRouter();
 const [discovery,setDiscovery]=useState(initialDiscovery);
 const [activities,setActivities]=useState(initialActivities);
 const [companyCount,setCompanyCount]=useState(initialCompanyCount);
 const latestSnapshot=useRef(snapshot(initialDiscovery,initialActivities,initialCompanyCount));
 const active=isJobActive(discovery);
 const retryScheduled=isJobRetryScheduled(discovery);
 const running=isJobRunning(discovery);
 const watchable=active||retryScheduled;

 useEffect(()=>{
  if(!watchable) return;
  let cancelled=false;
  let requestInFlight=false;

  const refreshStatus=async()=>{
   if(requestInFlight||cancelled)return;
   requestInFlight=true;
   window.dispatchEvent(new CustomEvent("salespilot:api-start",{detail:{method:"GET",url:`/api/campaigns/${campaignId}/discovery/status`}}));
   try{
    const response=await fetch(`/api/campaigns/${campaignId}/discovery/status`,{cache:"no-store"});
    if(!response.ok)return;
    const data=await response.json();
    if(cancelled)return;
    const nextDiscovery=data.discovery??null;
    const nextActivities=data.activities??[];
    const nextCompanyCount=data.companyCount??0;
    const nextSnapshot=snapshot(nextDiscovery,nextActivities,nextCompanyCount);
    setDiscovery(nextDiscovery);setActivities(nextActivities);setCompanyCount(nextCompanyCount);
    const changed=nextSnapshot!==latestSnapshot.current;
    latestSnapshot.current=nextSnapshot;
    const nextState=resolvePersistedJobState(nextDiscovery);
    const retryDue=nextState==="FAILED_RETRYABLE" && nextDiscovery?.next_retry_at && Date.parse(nextDiscovery.next_retry_at)<=Date.now();
    if(changed||retryDue) router.refresh();
   }catch{}finally{
    requestInFlight=false;
    window.dispatchEvent(new CustomEvent("salespilot:api-finish",{detail:{method:"GET",url:`/api/campaigns/${campaignId}/discovery/status`}}));
   }
  };

  const onVisible=()=>{if(document.visibilityState==="visible") void refreshStatus();};
  const onFocus=()=>void refreshStatus();
  void refreshStatus();
  const timer=window.setInterval(refreshStatus,retryScheduled?1500:2000);
  document.addEventListener("visibilitychange",onVisible);
  window.addEventListener("focus",onFocus);
  return()=>{cancelled=true;window.clearInterval(timer);document.removeEventListener("visibilitychange",onVisible);window.removeEventListener("focus",onFocus)};
 },[campaignId,watchable,retryScheduled,router]);

 const visible=useMemo(()=>activities.slice(0,5),[activities]);
 if(!visible.length)return null;
 return <div className="discovery-live-feed" aria-live="polite">
  <div className="discovery-live-head"><span className={running?"live-dot active":"live-dot"}/><strong>{running?"SalesPilot is working":jobStateLabel(discovery,{queued:"Company discovery queued",complete:"SalesPilot activity",noResults:"Research completed with no new matches"})}</strong><small>{companyCount} compan{companyCount===1?"y":"ies"} saved</small></div>
  <div className="discovery-live-items">{visible.map(item=><div className="discovery-live-item" key={item.id}><CheckCircle2 size={16}/><div><strong>{item.title}</strong>{item.description&&<span>{item.description}</span>}</div><time title={new Date(item.occurred_at).toLocaleString()} dateTime={item.occurred_at}>{relative(item.occurred_at)}</time></div>)}</div>
 </div>;
}
function relative(value:string){const seconds=Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/1000));if(seconds<10)return "Just now";if(seconds<60)return `${seconds}s ago`;const minutes=Math.floor(seconds/60);if(minutes<60)return `${minutes}m ago`;const hours=Math.floor(minutes/60);if(hours<24)return `${hours}h ago`;return `${Math.floor(hours/24)}d ago`;}

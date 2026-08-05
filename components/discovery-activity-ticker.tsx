"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "@/components/icons";
import { isJobActive, isJobRunning, jobStateLabel } from "@/lib/pipeline/presentation";

type Activity={id:string;title:string;description?:string|null;occurred_at:string};
type Discovery={status:string;job_state?:string|null;stage:string;progress:number;recommendations_saved:number;next_retry_at?:string|null};
export function DiscoveryActivityTicker({campaignId,initialDiscovery,initialActivities,initialCompanyCount}:{campaignId:string;initialDiscovery:Discovery|null;initialActivities:Activity[];initialCompanyCount:number}){
 const router=useRouter();
 const [discovery,setDiscovery]=useState(initialDiscovery);
 const [activities,setActivities]=useState(initialActivities);
 const [companyCount,setCompanyCount]=useState(initialCompanyCount);
 const active=isJobActive(discovery);
 const running=isJobRunning(discovery);
 useEffect(()=>{
  if(!active) return;
  const timer=window.setInterval(async()=>{
   try{
    const response=await fetch(`/api/campaigns/${campaignId}/discovery/status`,{cache:"no-store"});
    if(!response.ok)return;
    const data=await response.json();
    const priorStatus=discovery?.status;
    const priorCount=companyCount;
    setDiscovery(data.discovery);setActivities(data.activities??[]);setCompanyCount(data.companyCount??0);
    if(data.discovery?.status!==priorStatus||data.companyCount!==priorCount) router.refresh();
   }catch{}
  },3500);
  return()=>window.clearInterval(timer);
 },[campaignId,active,router,discovery?.status,discovery?.job_state,companyCount]);
 const visible=useMemo(()=>activities.slice(0,5),[activities]);
 if(!visible.length)return null;
 return <div className="discovery-live-feed" aria-live="polite">
  <div className="discovery-live-head"><span className={running?"live-dot active":"live-dot"}/><strong>{running?"SalesPilot is working":jobStateLabel(discovery,{queued:"Company discovery queued",complete:"SalesPilot activity",noResults:"Research completed with no new matches"})}</strong><small>{companyCount} compan{companyCount===1?"y":"ies"} saved</small></div>
  <div className="discovery-live-items">{visible.map(item=><div className="discovery-live-item" key={item.id}><CheckCircle2 size={16}/><div><strong>{item.title}</strong>{item.description&&<span>{item.description}</span>}</div><time title={new Date(item.occurred_at).toLocaleString()} dateTime={item.occurred_at}>{relative(item.occurred_at)}</time></div>)}</div>
 </div>;
}
function relative(value:string){const seconds=Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/1000));if(seconds<10)return "Just now";if(seconds<60)return `${seconds}s ago`;const minutes=Math.floor(seconds/60);if(minutes<60)return `${minutes}m ago`;const hours=Math.floor(minutes/60);if(hours<24)return `${hours}h ago`;return `${Math.floor(hours/24)}d ago`;}

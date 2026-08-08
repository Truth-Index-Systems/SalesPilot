"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "@/components/icons";
import { isJobActive, isJobRetryScheduled, isJobRunning, jobStateLabel, resolvePersistedJobState } from "@/lib/pipeline/presentation";

type Activity={id:string;title:string;description?:string|null;occurred_at:string};
type Candidate={id:string;company_name:string;industry?:string|null;country?:string|null;candidate_status:"DISCOVERED"|"VERIFIED"|"HELD";confidence?:number|null};
type Discovery={status:string;job_state?:string|null;stage:string;progress:number;recommendations_saved:number;next_retry_at?:string|null;next_attempt_at?:string|null;attempt_count?:number|null;last_error_code?:string|null;updated_at?:string|null};

function snapshot(discovery:Discovery|null,activities:Activity[],companyCount:number,candidateCount=0,verifiedCandidateCount=0,recentCandidates:Candidate[]=[]){
 return JSON.stringify({
  status:discovery?.status??null,
  jobState:discovery?.job_state??null,
  stage:discovery?.stage??null,
  progress:discovery?.progress??null,
  saved:discovery?.recommendations_saved??null,
  retry:discovery?.next_retry_at??null,
  nextAttempt:discovery?.next_attempt_at??null,
  attempts:discovery?.attempt_count??null,
  errorCode:discovery?.last_error_code??null,
  updatedAt:discovery?.updated_at??null,
  companyCount,
  candidateCount,
  verifiedCandidateCount,
  candidates:recentCandidates.slice(0,6).map(item=>[item.id,item.company_name,item.candidate_status]),
  activities:activities.slice(0,8).map(item=>[item.id,item.title,item.occurred_at]),
 });
}

export function DiscoveryActivityTicker({campaignId,initialDiscovery,initialActivities,initialCompanyCount}:{campaignId:string;initialDiscovery:Discovery|null;initialActivities:Activity[];initialCompanyCount:number}){
 const router=useRouter();
 const [discovery,setDiscovery]=useState(initialDiscovery);
 const [activities,setActivities]=useState(initialActivities);
 const [companyCount,setCompanyCount]=useState(initialCompanyCount);
 const [candidateCount,setCandidateCount]=useState(0);
 const [verifiedCandidateCount,setVerifiedCandidateCount]=useState(0);
 const [recentCandidates,setRecentCandidates]=useState<Candidate[]>([]);
 const latestSnapshot=useRef(snapshot(initialDiscovery,initialActivities,initialCompanyCount,0,0,[]));
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
   try{
    const response=await fetch(`/api/campaigns/${campaignId}/discovery/status`,{cache:"no-store"});
    if(!response.ok)return;
    const data=await response.json();
    if(cancelled)return;
    const nextDiscovery=data.discovery??null;
    const nextActivities=data.activities??[];
    const nextCompanyCount=data.companyCount??0;
    const nextCandidateCount=data.candidateCount??0;
    const nextVerifiedCandidateCount=data.verifiedCandidateCount??0;
    const nextRecentCandidates=data.recentCandidates??[];
    const nextSnapshot=snapshot(nextDiscovery,nextActivities,nextCompanyCount,nextCandidateCount,nextVerifiedCandidateCount,nextRecentCandidates);
    setDiscovery(nextDiscovery);setActivities(nextActivities);setCompanyCount(nextCompanyCount);
    setCandidateCount(nextCandidateCount);setVerifiedCandidateCount(nextVerifiedCandidateCount);setRecentCandidates(nextRecentCandidates);
    const changed=nextSnapshot!==latestSnapshot.current;
    latestSnapshot.current=nextSnapshot;
    const nextState=resolvePersistedJobState(nextDiscovery);
    const retryDue=nextState==="FAILED_RETRYABLE" && nextDiscovery?.next_retry_at && Date.parse(nextDiscovery.next_retry_at)<=Date.now();
    if(changed||retryDue) router.refresh();
   }catch{}finally{
    requestInFlight=false;
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
  <div className="discovery-live-head"><span className={running?"live-dot active":"live-dot"}/><strong>{running?"MarketRoute is working":jobStateLabel(discovery,{queued:"Company discovery queued",complete:"MarketRoute activity",noResults:"Research completed with no new matches"})}</strong><small>{candidateCount>0?`${candidateCount} found · ${companyCount} verified`:`${companyCount} compan${companyCount===1?"y":"ies"} saved`}</small></div>
  {candidateCount>0&&<div className="discovery-candidate-strip"><div><strong>{candidateCount} potential match{candidateCount===1?"":"es"} discovered</strong><span>{verifiedCandidateCount} verified so far · official evidence checks are continuing</span></div><div className="discovery-candidate-chips">{recentCandidates.filter(item=>item.candidate_status!=="HELD").slice(0,4).map(item=><span className={`discovery-candidate-chip ${item.candidate_status.toLowerCase()}`} key={item.id}>{item.company_name}<small>{item.candidate_status==="VERIFIED"?"Verified":"Checking"}</small></span>)}</div></div>}
  <div className="discovery-live-items">{visible.map(item=><div className="discovery-live-item" key={item.id}><CheckCircle2 size={16}/><div><strong>{item.title}</strong>{item.description&&<span>{item.description}</span>}</div><time title={new Date(item.occurred_at).toLocaleString()} dateTime={item.occurred_at}>{relative(item.occurred_at)}</time></div>)}</div>
 </div>;
}
function relative(value:string){const seconds=Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/1000));if(seconds<10)return "Just now";if(seconds<60)return `${seconds}s ago`;const minutes=Math.floor(seconds/60);if(minutes<60)return `${minutes}m ago`;const hours=Math.floor(minutes/60);if(hours<24)return `${hours}h ago`;return `${Math.floor(hours/24)}d ago`;}

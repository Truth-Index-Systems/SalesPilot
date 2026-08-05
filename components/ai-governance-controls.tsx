"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function AiGovernanceControls(props:{enabled:boolean;dailyRequestLimit:number;dailyCostLimitUsd:number;campaignDailyRequestLimit:number}){
  const router=useRouter();const [saving,setSaving]=useState(false);const [error,setError]=useState<string|null>(null);
  const [enabled,setEnabled]=useState(props.enabled);const [requests,setRequests]=useState(props.dailyRequestLimit);const [cost,setCost]=useState(props.dailyCostLimitUsd);const [campaign,setCampaign]=useState(props.campaignDailyRequestLimit);
  async function save(nextEnabled=enabled){setSaving(true);setError(null);try{const response=await fetch("/api/internal/autonomy/governance",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({autonomyEnabled:nextEnabled,dailyRequestLimit:requests,dailyCostLimitUsd:cost,campaignDailyRequestLimit:campaign})});if(!response.ok)throw new Error("Could not update AI governance");setEnabled(nextEnabled);router.refresh();}catch(e){setError(e instanceof Error?e.message:"Could not update AI governance");}finally{setSaving(false);}}
  return <div className="section">
    <div className="detail-list">
      <label><span>Workspace daily AI requests</span><input className="input" type="number" min="0" value={requests} onChange={e=>setRequests(Number(e.target.value))}/></label>
      <label><span>Workspace daily AI budget (USD)</span><input className="input" type="number" min="0" step="0.25" value={cost} onChange={e=>setCost(Number(e.target.value))}/></label>
      <label><span>Campaign daily AI requests</span><input className="input" type="number" min="0" value={campaign} onChange={e=>setCampaign(Number(e.target.value))}/></label>
    </div>
    {error&&<div className="website-error section" role="alert">{error}</div>}
    <div className="review-actions section">
      <button className="button secondary" disabled={saving} onClick={()=>save()}>{saving?"Saving…":"Save limits"}</button>
      {enabled?<button className="button danger" disabled={saving} onClick={()=>save(false)}>Stop autonomy</button>:<button className="button" disabled={saving} onClick={()=>save(true)}>Enable autonomy</button>}
    </div>
    <p className="muted">The deployment-level gate <code>SALESPILOT_AI_PLATFORM_ENABLED=true</code> is also required. This prevents a database switch alone from enabling spend.</p>
  </div>;
}

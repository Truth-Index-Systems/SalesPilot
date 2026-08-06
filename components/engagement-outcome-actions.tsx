"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
const outcomes=[
  ["NO_RESPONSE","No response"],["REPLIED","Replied"],["MEETING_BOOKED","Meeting booked"],["QUALIFIED","Qualified"],["WON","Won"],["LOST","Lost"],
] as const;
export function EngagementOutcomeActions({id,latest}:{id:string;latest?:string|null}){
  const router=useRouter();const [outcome,setOutcome]=useState(latest??"REPLIED");const [note,setNote]=useState("");const [value,setValue]=useState("");const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  async function save(){setBusy(true);setError("");try{const response=await fetch(`/api/engagements/${id}/outcome`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({outcome,note:note||undefined,outcomeValue:value?Number(value):undefined})});if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.error??"Unable to record outcome");}setNote("");setValue("");router.refresh();}catch(e){setError(e instanceof Error?e.message:"Unable to record outcome");}finally{setBusy(false);}}
  return <div className="engagement-outcome-actions"><div className="grid cols-2"><label><span>Outcome</span><select value={outcome} onChange={e=>setOutcome(e.target.value)}>{outcomes.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label><span>Won value (optional)</span><input inputMode="decimal" value={value} onChange={e=>setValue(e.target.value)} placeholder="0.00"/></label></div><label className="section"><span>Outcome note</span><textarea rows={3} value={note} onChange={e=>setNote(e.target.value)} placeholder="What happened?"/></label>{error&&<p className="error-text">{error}</p>}<button className="button primary" type="button" onClick={save} disabled={busy}>{busy?"Saving…":"Record outcome"}</button></div>;
}

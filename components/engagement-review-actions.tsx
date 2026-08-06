"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function EngagementReviewActions({id,initial,channel="EMAIL"}:{id:string;channel?:string;initial:{subject:string;opening:string;personalisation:string;valueProposition:string;callToAction:string}}){
  const router=useRouter();const [busy,setBusy]=useState<string|null>(null);const [editing,setEditing]=useState(false);const [error,setError]=useState("");const [note,setNote]=useState("");const [draft,setDraft]=useState(initial);
  async function act(action:"APPROVED"|"EDITED"|"REJECTED"|"REGENERATE_REQUESTED"){
    setBusy(action);setError("");try{const response=await fetch(`/api/engagements/${id}/review`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action,note:note||undefined,edit:action==="EDITED"?draft:undefined})});if(!response.ok)throw new Error();router.push("/replies");router.refresh();}catch{setError("SalesPilot could not save this engagement review.");}finally{setBusy(null);}
  }
  return <div className="engagement-review-panel">
    {editing&&<div className="engagement-editor">
      <label>Subject<input value={draft.subject} onChange={e=>setDraft({...draft,subject:e.target.value})}/></label>
      <label>Opening<textarea value={draft.opening} onChange={e=>setDraft({...draft,opening:e.target.value})}/></label>
      <label>Personalisation<textarea value={draft.personalisation} onChange={e=>setDraft({...draft,personalisation:e.target.value})}/></label>
      <label>Value proposition<textarea value={draft.valueProposition} onChange={e=>setDraft({...draft,valueProposition:e.target.value})}/></label>
      <label>Call to action<textarea value={draft.callToAction} onChange={e=>setDraft({...draft,callToAction:e.target.value})}/></label>
    </div>}
    <label className="review-note-label">Review note <span>Optional · stored in engagement history</span></label>
    <textarea className="review-note" value={note} onChange={e=>setNote(e.target.value)} maxLength={500} placeholder="Record the reasoning behind your decision."/>
    <div className="company-review-actions">
      {!editing?<><button className="button primary" disabled={!!busy} onClick={()=>act("APPROVED")}>{busy==="APPROVED"?"Approving…":channel==="EMAIL"?"Approve and queue":"Approve engagement"}</button>{channel==="EMAIL"&&<button className="button secondary" disabled={!!busy} onClick={()=>setEditing(true)}>Edit</button>}</>:<><button className="button primary" disabled={!!busy} onClick={()=>act("EDITED")}>{busy==="EDITED"?"Saving…":channel==="EMAIL"?"Save edits and approve":"Save and approve"}</button><button className="button secondary" disabled={!!busy} onClick={()=>setEditing(false)}>Cancel edit</button></>}
      <button className="button secondary" disabled={!!busy} onClick={()=>act("REGENERATE_REQUESTED")}>{busy==="REGENERATE_REQUESTED"?"Requesting…":"Regenerate"}</button>
      <button className="button danger" disabled={!!busy} onClick={()=>act("REJECTED")}>{busy==="REJECTED"?"Rejecting…":"Reject"}</button>
    </div>{error&&<p className="review-error">{error}</p>}
  </div>;
}

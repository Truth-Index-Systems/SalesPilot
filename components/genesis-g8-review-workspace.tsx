"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Evidence = {id:string;claimLabel:string;direction:string;sourceUri:string|null;excerpt:string|null;sourceClass:string;quality:number;observedAt:string;channel:string};
type ReviewTask = {id:string;entity_type:string;truth_index:number;confidence:number;coverage:number;created_at:string;displayName:string;canonicalKey:string;reasons:unknown[];claimKeys:unknown[];companyLabel:string;whyItMatters:string;evidence:Evidence[]};
type Summary={open:number;approved:number;corrected:number;moreResearch:number;rejected:number};
type Activity={occurredAt:string;kind:string;title:string;detail:string;status:string;refId:string};

const relative=(iso:string)=>{const ms=Date.now()-new Date(iso).getTime();const min=Math.max(0,Math.round(ms/60000));if(min<1)return"just now";if(min<60)return`${min}m ago`;const h=Math.round(min/60);if(h<24)return`${h}h ago`;return`${Math.round(h/24)}d ago`;};
const qualityLabel=(v:number)=>v>=.72?"High":v>=.45?"Medium":"Low";

export function GenesisG8ReviewWorkspace({tasks,summary,activity}:{tasks:ReviewTask[];summary:Summary;activity:Activity[]}){
  const router=useRouter();
  const [busy,setBusy]=useState<string|null>(null);
  const [notice,setNotice]=useState<{type:"ok"|"error";text:string}|null>(null);
  const [notes,setNotes]=useState<Record<string,string>>({});
  const [sort,setSort]=useState<"truth"|"oldest">("truth");
  const sorted=useMemo(()=>[...tasks].sort((a,b)=>sort==="truth"?Number(b.truth_index)-Number(a.truth_index):new Date(a.created_at).getTime()-new Date(b.created_at).getTime()),[tasks,sort]);

  async function resolve(task:ReviewTask,action:"APPROVE"|"CORRECT"|"MORE_RESEARCH"|"REJECT"){
    const note=(notes[task.id]??"").trim();
    if(action==="CORRECT"&&!note){setNotice({type:"error",text:"Add the correction you want Genesis to verify before choosing Correct."});return;}
    setBusy(`${task.id}:${action}`);setNotice(null);
    try{
      const form=new FormData();form.set("action",action);form.set("reasonCode","FOUNDER_DASHBOARD");if(note)form.set("note",note);
      const response=await fetch(`/dashboard/genesis-g8/reviews/${task.id}/resolve`,{method:"POST",body:form,headers:{Accept:"application/json"}});
      const body=await response.json().catch(()=>null);
      if(!response.ok||!body?.ok) throw new Error(body?.error??`Review action failed (${response.status})`);
      const verb=action==="MORE_RESEARCH"?"Research queued":action==="CORRECT"?"Correction sent for verification":action==="REJECT"?"Intelligence rejected and suppressed":"Intelligence approved";
      setNotice({type:"ok",text:`${verb}: ${task.displayName}.`});
      router.refresh();
    }catch(error){setNotice({type:"error",text:error instanceof Error?error.message:"Review action failed"});}
    finally{setBusy(null);}
  }

  return <section className="founder-panel founder-g8-review-panel founder-review-workspace">
    <div className="founder-review-layout">
      <div className="founder-review-main">
        <div className="founder-review-titlebar">
          <div><span className="founder-review-kicker">Human intelligence review</span><h2>Review and validate intelligence</h2><p>Inspect the evidence Genesis used, then approve it, correct it, ask for more research, or reject it. Human judgement changes eligibility; sourced evidence remains responsible for Truth.</p></div>
          <div className="founder-review-controls"><select value={sort} onChange={e=>setSort(e.target.value as "truth"|"oldest")}><option value="truth">Highest Truth first</option><option value="oldest">Oldest first</option></select><button type="button" onClick={()=>router.refresh()}>Refresh ↻</button></div>
        </div>
        <div className="founder-g8-review-summary enhanced"><span className="pending">Pending review <b>{summary.open}</b></span><span>Approved <b>{summary.approved}</b></span><span>Corrected <b>{summary.corrected}</b></span><span>More research <b>{summary.moreResearch}</b></span><span>Rejected <b>{summary.rejected}</b></span></div>
        {notice?<div className={`founder-review-notice ${notice.type}`}>{notice.text}</div>:null}
        <div className="founder-g8-review-list enhanced">
          {sorted.length?sorted.map(task=>{
            const evidence=task.evidence??[];
            const lastSeen=evidence.length?evidence.reduce((latest,item)=>new Date(item.observedAt)>new Date(latest)?item.observedAt:latest,evidence[0].observedAt):task.created_at;
            const priority=Number(task.truth_index)<20||Number(task.confidence)<50?"High":Number(task.truth_index)<50?"Medium":"Normal";
            return <article key={task.id} className="founder-g8-review-card enhanced">
              <div className="founder-review-card-head"><div className="founder-review-entity"><span>{task.entity_type.replaceAll("_"," ")}</span><h3>{task.displayName}</h3><div><b>Company</b> {task.companyLabel} <b>Canonical</b> {task.canonicalKey}</div></div><div className="founder-g8-score"><b>{Number(task.truth_index).toFixed(1)}</b><small>Truth Index</small><em className={`priority-${priority.toLowerCase()}`}>{priority} priority</em></div></div>
              <div className="founder-review-metric-row"><div><span>Confidence</span><strong>{Number(task.confidence).toFixed(1)}%</strong><i><b style={{width:`${Math.max(2,Number(task.confidence))}%`}}/></i></div><div><span>Coverage</span><strong>{Number(task.coverage).toFixed(1)}%</strong><i><b style={{width:`${Math.max(2,Number(task.coverage))}%`}}/></i></div><div><span>Evidence items</span><strong>{evidence.length}</strong><small>verifiable sources</small></div><div><span>First seen</span><strong>{relative(task.created_at)}</strong></div><div><span>Last evidence</span><strong>{relative(lastSeen)}</strong></div></div>
              <div className="founder-review-why"><strong>Why Genesis needs you</strong><p>{task.whyItMatters}</p><div>{task.reasons.length?task.reasons.map(String).join(" · "):"Explicit review requested because the current Truth state is not strong enough for autonomous use."}</div></div>
              <div className="founder-review-evidence"><div className="founder-review-evidence-head"><strong>Evidence ({evidence.length})</strong><span>{task.claimKeys.length?`Claims: ${task.claimKeys.map(String).join(", ")}`:"Entity-level review"}</span></div>{evidence.length?<div className="founder-review-evidence-table">{evidence.slice(0,8).map(item=><div key={item.id}><span className="evidence-direction">{item.direction==="CONTRADICTS"?"−":"↗"}</span><div><a href={item.sourceUri??"#"} target="_blank" rel="noreferrer">{item.sourceUri??item.claimLabel}</a><small>{item.excerpt??item.claimLabel}</small></div><span>{item.sourceClass.replaceAll("_"," ")}</span><b className={`quality-${qualityLabel(item.quality).toLowerCase()}`}>{qualityLabel(item.quality)}</b></div>)}</div>:<div className="founder-empty compact">No source evidence is attached yet. More research is usually the safest action.</div>}</div>
              <div className="founder-g8-review-form enhanced"><input value={notes[task.id]??""} onChange={e=>setNotes(v=>({...v,[task.id]:e.target.value}))} type="text" placeholder="Optional note — required when correcting"/><div className="founder-g8-review-actions enhanced"><button disabled={!!busy} onClick={()=>resolve(task,"APPROVE")}>{busy===`${task.id}:APPROVE`?"Saving…":"✓ Approve"}</button><button disabled={!!busy} onClick={()=>resolve(task,"CORRECT")} className="correct">{busy===`${task.id}:CORRECT`?"Saving…":"✎ Correct"}</button><button disabled={!!busy} onClick={()=>resolve(task,"MORE_RESEARCH")} className="research">{busy===`${task.id}:MORE_RESEARCH`?"Queuing…":"⌕ More research"}</button><button disabled={!!busy} onClick={()=>resolve(task,"REJECT")} className="danger">{busy===`${task.id}:REJECT`?"Saving…":"× Reject"}</button><small>Review ID: {task.id}</small></div></div>
            </article>;
          }):<div className="founder-empty">No Genesis decisions currently need human judgement.</div>}
        </div>
      </div>
      <aside className="founder-review-sidebar">
        <div className="founder-activity-panel"><div className="founder-activity-head"><strong>Live activity feed</strong><span>● Live</span></div><div className="founder-activity-list">{activity.length?activity.slice(0,12).map(item=><div key={`${item.kind}-${item.refId}`}><time>{new Date(item.occurredAt).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}</time><div><span className={`activity-${item.kind.toLowerCase()}`}>{item.kind}</span><strong>{item.title}</strong><small>{item.detail}</small></div></div>):<div className="founder-empty compact">Genesis activity will appear here as the engine works.</div>}</div></div>
        <div className="founder-review-guide"><strong>Review guide</strong><div><b>✓</b><p><span>Approve</span>Evidence is accurate, relevant and sufficient for use.</p></div><div><b>✎</b><p><span>Correct</span>Tell Genesis what looks wrong; it will verify your correction with sourced evidence.</p></div><div><b>⌕</b><p><span>More research</span>Evidence is incomplete, stale or ambiguous.</p></div><div><b>×</b><p><span>Reject</span>The entity/route is wrong or commercially irrelevant. It stays in history but is suppressed.</p></div></div>
      </aside>
    </div>
  </section>;
}

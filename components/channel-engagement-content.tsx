"use client";
import { useState } from "react";

type Content = Record<string, unknown> | null | undefined;
const text=(v:unknown)=>typeof v==="string"?v:"";
const lines=(v:unknown)=>Array.isArray(v)?v.filter((x):x is string=>typeof x==="string"):[];
export function ChannelEngagementContent({channel,content,executionInstruction,compatibility}:{channel:string|null;content:Content;executionInstruction:string|null;compatibility:{subject:string|null;opening:string|null;valueProposition:string|null;callToAction:string|null}}){
  const [copied,setCopied]=useState(""); const c=content??{}; const ch=(channel??"EMAIL").toUpperCase();
  async function copy(label:string,value:string){if(!value)return;await navigator.clipboard.writeText(value);setCopied(label);setTimeout(()=>setCopied(""),1600)}
  const block=(label:string,value:string)=>value?<div><span>{label}</span><p>{value}</p><button type="button" className="button text" onClick={()=>copy(label,value)}>{copied===label?"Copied":"Copy"}</button></div>:null;
  if(ch==="LINKEDIN") return <div className="outreach-message">{block("Connection request",text(c.connectionRequest))}{block("LinkedIn message",text(c.directMessage)||compatibility.opening||"")}{block("Follow-up",text(c.followUpMessage))}{executionInstruction&&<div><span>Next action</span><p>{executionInstruction}</p></div>}</div>;
  if(ch==="WEBSITE_FORM") return <div className="outreach-message">{block("Suggested subject",text(c.formSubject))}{block("Contact form message",text(c.formMessage)||compatibility.opening||"")}{executionInstruction&&<div><span>Next action</span><p>{executionInstruction}</p></div>}</div>;
  if(ch==="PHONE") return <div className="outreach-message">{block("Call opening",text(c.callOpening)||compatibility.opening||"")}{lines(c.discoveryQuestions).length>0&&<div><span>Discovery questions</span><ul>{lines(c.discoveryQuestions).map((x,i)=><li key={i}>{x}</li>)}</ul></div>}{lines(c.objectionResponses).length>0&&<div><span>Objection responses</span><ul>{lines(c.objectionResponses).map((x,i)=><li key={i}>{x}</li>)}</ul></div>}</div>;
  if(["REFERRAL","EXISTING_CUSTOMER","PARTNER","INTERNAL_CHAMPION","EXECUTIVE_ASSISTANT"].includes(ch)) return <div className="outreach-message">{block("Introduction request",text(c.referralRequest)||compatibility.opening||"")}{block("Message for introduction",text(c.introductionMessage))}{executionInstruction&&<div><span>Next action</span><p>{executionInstruction}</p></div>}</div>;
  if(ch==="PROCUREMENT") return <div className="outreach-message">{block("Supplier introduction",text(c.procurementIntroduction)||compatibility.opening||"")}{block("Qualification summary",text(c.qualificationSummary))}{executionInstruction&&<div><span>Next action</span><p>{executionInstruction}</p></div>}</div>;
  return <div className="outreach-message"><div><span>Subject</span><strong>{text(c.subject)||compatibility.subject}</strong></div>{block("Email",text(c.emailBody)||compatibility.opening||"")}<div><span>Value proposition</span><p>{compatibility.valueProposition}</p></div><div><span>Call to action</span><p>{compatibility.callToAction}</p></div></div>;
}

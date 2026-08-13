export const MARKETROUTE_FORENSIC_BUILD6_CONTACT_TRUTH_VERSION = "MR-T8-FB6-CONTACT-TRUTH-1.0.0" as const;

export type ContactTruthClaimType = "IDENTITY" | "CURRENT_ROLE" | "CURRENT_EMPLOYMENT" | "EMAIL_OWNERSHIP" | "LINKEDIN_OWNERSHIP";
export type ContactTruthState = "KNOWN" | "SUPPORTED" | "UNRESOLVED" | "STALE" | "CONTRADICTED";
export type ContactTruthFreshness = "CURRENT" | "STALE" | "UNDATED";

export type ContactTruthEvidence = Readonly<{
  id: string;
  evidenceType: string;
  claim: string;
  sourceUrl: string;
  sourceTitle: string | null;
  excerpt: string | null;
  sourceKind: string;
  sourceDomain: string | null;
  excerptMatched: boolean;
  retrievedAt: string | null;
  sourcePublishedAt?: string | null;
  truthPolarity?: "SUPPORTS" | "CONTRADICTS";
}>;

export type ContactTruthSubject = Readonly<{
  contactId: string;
  fullName: string;
  roleTitle: string;
  emailAddress: string | null;
  linkedinProfileUrl: string | null;
  companyName: string;
  companyDomain: string | null;
}>;

export type ContactTruthClaim = Readonly<{
  claimType: ContactTruthClaimType;
  state: ContactTruthState;
  freshness: ContactTruthFreshness;
  supportingEvidenceIds: readonly string[];
  contradictingEvidenceIds: readonly string[];
  independentSupportFamilies: number;
  nextRevalidationAt: string | null;
  reason: string;
}>;

export type ContactTruthSnapshot = Readonly<{
  semanticsVersion: typeof MARKETROUTE_FORENSIC_BUILD6_CONTACT_TRUTH_VERSION;
  contactId: string;
  evaluatedAt: string;
  claims: Readonly<Record<ContactTruthClaimType, ContactTruthClaim>>;
  authorityReady: boolean;
  nextRevalidationAt: string | null;
}>;

const LIVE_SOURCE_KINDS = new Set(["OFFICIAL_WEBSITE", "OFFICIAL_LINKEDIN_COMPANY", "OFFICIAL_LINKEDIN_PROFILE", "PUBLISHED_STAFF_DIRECTORY"]);
const WINDOW_DAYS: Readonly<Record<ContactTruthClaimType, number>> = Object.freeze({
  IDENTITY: 365,
  CURRENT_ROLE: 180,
  CURRENT_EMPLOYMENT: 180,
  EMAIL_OWNERSHIP: 120,
  LINKEDIN_OWNERSHIP: 120,
});

function norm(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9@._:/-]+/g, " ").trim().replace(/\s+/g, " ");
}
function body(e: ContactTruthEvidence): string { return norm(`${e.claim} ${e.excerpt ?? ""} ${e.sourceTitle ?? ""}`); }
function host(value: string | null | undefined): string { try { return new URL(value ?? "").hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; } }
function date(value: string | null | undefined): Date | null { if (!value) return null; const d=new Date(value); return Number.isFinite(d.getTime())?d:null; }
function addDays(d: Date, days: number): Date { return new Date(d.getTime()+days*86400000); }
function exactishContains(text: string, expected: string): boolean {
  const e=norm(expected); if (!e) return false;
  const t=norm(text); if (t.includes(e)) return true;
  const tokens=e.split(" ").filter(x=>x.length>2); return tokens.length>=2 && tokens.every(token=>t.includes(token));
}
function sourceFamily(e: ContactTruthEvidence): string { return host(e.sourceUrl)||norm(e.sourceDomain)||e.sourceUrl; }
function evidenceReferenceDate(e: ContactTruthEvidence): Date | null {
  if (LIVE_SOURCE_KINDS.has(e.sourceKind)) return date(e.retrievedAt);
  return date(e.sourcePublishedAt ?? null);
}
function isCurrent(e: ContactTruthEvidence, claimType: ContactTruthClaimType, now: Date): boolean {
  const ref=evidenceReferenceDate(e); if (!ref) return false;
  return addDays(ref,WINDOW_DAYS[claimType]).getTime()>=now.getTime();
}
function nextExpiry(e: ContactTruthEvidence, claimType: ContactTruthClaimType): Date | null {
  const ref=evidenceReferenceDate(e); return ref?addDays(ref,WINDOW_DAYS[claimType]):null;
}
function evidenceQualifies(e: ContactTruthEvidence): boolean {
  const temporalBasis=LIVE_SOURCE_KINDS.has(e.sourceKind)||Boolean(date(e.sourcePublishedAt ?? null));
  return Boolean(e.id && e.sourceUrl && e.claim && e.excerptMatched && host(e.sourceUrl) && temporalBasis);
}

function claim(
  claimType: ContactTruthClaimType,
  evidence: readonly ContactTruthEvidence[],
  supports: (e: ContactTruthEvidence)=>boolean,
  now: Date,
): ContactTruthClaim {
  const relevant=evidence.filter(evidenceQualifies);
  const supportAll=relevant.filter(e=> (e.truthPolarity??"SUPPORTS")==="SUPPORTS" && supports(e));
  const contradictions=relevant.filter(e=>e.truthPolarity==="CONTRADICTS" && supports(e));
  const currentSupport=supportAll.filter(e=>isCurrent(e,claimType,now));
  const currentContradictions=contradictions.filter(e=>isCurrent(e,claimType,now));
  const families=[...new Set(currentSupport.map(sourceFamily))];
  const expiries=currentSupport.map(e=>nextExpiry(e,claimType)).filter((v):v is Date=>v!==null).sort((a,b)=>a.getTime()-b.getTime());
  const next=expiries[0]?.toISOString()??null;
  let state:ContactTruthState="UNRESOLVED", freshness:ContactTruthFreshness="UNDATED", reason="NO_QUALIFYING_SUPPORT";
  if(currentContradictions.length){state="CONTRADICTED";freshness="CURRENT";reason="CURRENT_EXPLICIT_CONTRADICTION_PRESENT";}
  else if(currentSupport.length){state=families.length>=2?"KNOWN":"SUPPORTED";freshness="CURRENT";reason=families.length>=2?"MULTIPLE_INDEPENDENT_CURRENT_SUPPORT_FAMILIES":"ONE_CURRENT_DIRECT_SUPPORT_FAMILY";}
  else if(supportAll.length){state="STALE";freshness="STALE";reason="SUPPORT_EXISTS_BUT_IS_OUTSIDE_CONTACT_TRUTH_VALIDITY_WINDOW";}
  return Object.freeze({claimType,state,freshness,supportingEvidenceIds:Object.freeze(currentSupport.map(e=>e.id).sort()),contradictingEvidenceIds:Object.freeze(currentContradictions.map(e=>e.id).sort()),independentSupportFamilies:families.length,nextRevalidationAt:next,reason});
}

export function evaluateContactTruth(input: Readonly<{subject:ContactTruthSubject;evidence:readonly ContactTruthEvidence[];evaluatedAt?:string}>):ContactTruthSnapshot {
  const evaluatedAt=input.evaluatedAt??new Date().toISOString(); const now=new Date(evaluatedAt);
  if(!Number.isFinite(now.getTime())) throw new Error("CIE_R6_CONTACT_TRUTH_INVALID_REFERENCE_TIME");
  const {subject,evidence}=input; const companyDomain=norm(subject.companyDomain).replace(/^www\./,"");
  const companyName=norm(subject.companyName), email=norm(subject.emailAddress), linkedin=norm(subject.linkedinProfileUrl);
  const identity=claim("IDENTITY",evidence,e=>e.evidenceType==="IDENTITY"&&exactishContains(body(e),subject.fullName),now);
  const role=claim("CURRENT_ROLE",evidence,e=>e.evidenceType==="ROLE"&&exactishContains(body(e),subject.fullName)&&exactishContains(body(e),subject.roleTitle),now);
  const employment=claim("CURRENT_EMPLOYMENT",evidence,e=>{
    if(!["ROLE","IDENTITY"].includes(e.evidenceType)||!exactishContains(body(e),subject.fullName)) return false;
    const h=host(e.sourceUrl); const onCompanyDomain=Boolean(companyDomain&&(h===companyDomain||h.endsWith(`.${companyDomain}`)));
    return onCompanyDomain || Boolean(companyName&&exactishContains(body(e),subject.companyName));
  },now);
  const emailOwnership=claim("EMAIL_OWNERSHIP",evidence,e=>Boolean(email)&&e.evidenceType==="EMAIL"&&body(e).includes(email)&&exactishContains(body(e),subject.fullName),now);
  const linkedinOwnership=claim("LINKEDIN_OWNERSHIP",evidence,e=>Boolean(linkedin)&&e.evidenceType==="LINKEDIN"&&norm(e.sourceUrl)===linkedin&&exactishContains(body(e),subject.fullName),now);
  const claims=Object.freeze({IDENTITY:identity,CURRENT_ROLE:role,CURRENT_EMPLOYMENT:employment,EMAIL_OWNERSHIP:emailOwnership,LINKEDIN_OWNERSHIP:linkedinOwnership});
  const accepted=(c:ContactTruthClaim)=>c.state==="KNOWN"||c.state==="SUPPORTED";
  const authorityReady=accepted(identity)&&accepted(role)&&accepted(employment);
  const next=[identity,role,employment,emailOwnership,linkedinOwnership].map(c=>c.nextRevalidationAt).filter((v):v is string=>Boolean(v)).sort()[0]??null;
  return Object.freeze({semanticsVersion:MARKETROUTE_FORENSIC_BUILD6_CONTACT_TRUTH_VERSION,contactId:subject.contactId,evaluatedAt,claims,authorityReady,nextRevalidationAt:next});
}

export function contactTruthSupportsChannel(snapshot:ContactTruthSnapshot,channelType:string):boolean{
  if(channelType==="DIRECT_EMAIL") return ["KNOWN","SUPPORTED"].includes(snapshot.claims.EMAIL_OWNERSHIP.state);
  if(channelType==="LINKEDIN") return ["KNOWN","SUPPORTED"].includes(snapshot.claims.LINKEDIN_OWNERSHIP.state);
  return true;
}

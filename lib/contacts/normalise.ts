import type { ContactDiscoveryResult, DiscoveredContact, CompanyContactChannel } from "./schemas";
import { finaliseDeterministicContactRouteAuthority } from "./deterministic-authority";
function clean(value:string|null|undefined,max=900){return(value??"").replace(/\s+/g," ").trim().slice(0,max)}
function hostname(value:string){try{return new URL(value).hostname.toLowerCase().replace(/^www\./,"")}catch{return""}}
function companyDomain(value:string|null|undefined){if(!value)return"";try{return new URL(value).hostname.toLowerCase().replace(/^www\./,"")}catch{return value.toLowerCase().replace(/^www\./,"").split("/")[0]}}
function linkedinProfile(value:string|null|undefined){if(!value)return null;try{const u=new URL(value);const host=u.hostname.toLowerCase().replace(/^www\./,"");if(host!=="linkedin.com"&&!host.endsWith(".linkedin.com"))return null;if(!/^\/in\/[^/?#]+\/?$/i.test(u.pathname))return null;return `https://www.linkedin.com${u.pathname.replace(/\/$/,"")}`}catch{return null}}
function allowedSource(sourceUrl:string,sourceKind:string,officialDomain:string){const host=hostname(sourceUrl);if(!host)return false;if(officialDomain&&(host===officialDomain||host.endsWith(`.${officialDomain}`)))return true;if(["OFFICIAL_LINKEDIN_COMPANY","OFFICIAL_LINKEDIN_PROFILE"].includes(sourceKind))return host==="linkedin.com"||host.endsWith(".linkedin.com");if(sourceKind==="REGULATORY_FILING")return/(^|\.)(gov|gov\.uk|sec\.gov|companieshouse\.gov\.uk)$/.test(host);return false}
function allowedRelationshipSource(sourceUrl:string,sourceKind:string,targetDomain:string,endpointDomains:string[]){
 const host=hostname(sourceUrl);if(!host)return false;
 if(allowedSource(sourceUrl,sourceKind,targetDomain))return true;
 if(["OFFICIAL_WEBSITE","PRESS_RELEASE","PUBLISHED_STAFF_DIRECTORY"].includes(sourceKind)) return endpointDomains.some(d=>host===d||host.endsWith(`.${d}`));
 return false;
}
function validCompanyEmail(value:string|null|undefined,domain:string){if(!value)return null;const email=value.trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return null;const emailDomain=email.split("@")[1];if(!domain||!(emailDomain===domain||emailDomain.endsWith(`.${domain}`)))return null;return email}
function relationshipEntityMentioned(entity:{kind:string;label:string;canonicalDomain?:string|null},body:string,sourceHost:string,targetDomain:string){
 const b=body.toLowerCase();
 if(entity.kind==="TARGET_COMPANY") return Boolean(targetDomain&&(sourceHost===targetDomain||sourceHost.endsWith(`.${targetDomain}`)))||Boolean(entity.label&&b.includes(entity.label.toLowerCase()));
 if(entity.canonicalDomain){const d=entity.canonicalDomain.toLowerCase().replace(/^www\./,"");if(sourceHost===d||sourceHost.endsWith(`.${d}`)||b.includes(d))return true;}
 const label=entity.label.toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
 return label.length>=3&&b.replace(/[^a-z0-9]+/g," ").includes(label);
}
export function normaliseContactDiscoveryResult(result:ContactDiscoveryResult,companyWebsite?:string|null){
 const domain=companyDomain(companyWebsite);
 const contacts=result.contacts.map((contact):DiscoveredContact|null=>{
  const evidence=contact.evidence.map(item=>({...item,claim:clean(item.claim,500),sourceTitle:item.sourceTitle?clean(item.sourceTitle,240):null,excerpt:item.excerpt?clean(item.excerpt,900):null,sourceDomain:hostname(item.sourceUrl),verified:allowedSource(item.sourceUrl,item.sourceKind,domain),excerptMatched:Boolean(item.excerpt&&clean(item.excerpt).length>=20)})).filter(item=>item.verified&&item.claim&&item.sourceUrl);
  if(!evidence.some(x=>x.evidenceType==="IDENTITY")||!evidence.some(x=>x.evidenceType==="ROLE"))return null;
  const emailAddress=validCompanyEmail(contact.email.address,domain);const emailEvidence=evidence.some(x=>x.evidenceType==="EMAIL");
  const emailStatus=emailAddress&&emailEvidence?contact.email.status:"UNKNOWN";
  const profileUrl=linkedinProfile(contact.linkedin.profileUrl);const linkedinEvidence=evidence.some(x=>x.evidenceType==="LINKEDIN"&&linkedinProfile(x.sourceUrl)===profileUrl);
  const linkedinStatus=profileUrl&&linkedinEvidence?contact.linkedin.status:"UNKNOWN";
  const evidenceQuality=Math.round(evidence.reduce((sum,item)=>sum+item.qualityScore,0)/evidence.length);
  return {...contact,fullName:clean(contact.fullName,180),roleTitle:clean(contact.roleTitle,180),department:contact.department?clean(contact.department,180):null,location:contact.location?clean(contact.location,180):null,reasonSelected:clean(contact.reasonSelected,900),confidence:{...contact.confidence,evidenceQuality},email:{address:emailStatus==="UNKNOWN"?null:emailAddress,status:emailStatus,confidence:emailStatus==="UNKNOWN"?0:contact.email.confidence,sourceUrl:emailStatus==="UNKNOWN"?null:contact.email.sourceUrl,reason:clean(contact.email.reason,500)},linkedin:{profileUrl:linkedinStatus==="UNKNOWN"?null:profileUrl,status:linkedinStatus,confidence:linkedinStatus==="UNKNOWN"?0:contact.linkedin.confidence,sourceUrl:linkedinStatus==="UNKNOWN"?null:contact.linkedin.sourceUrl,reason:clean(contact.linkedin.reason,500)},unknowns:contact.unknowns.map(v=>clean(v,400)).filter(Boolean),riskFlags:contact.riskFlags.map(v=>clean(v,400)).filter(Boolean),evidence};
 }).filter((contact):contact is DiscoveredContact=>Boolean(contact));
 const seen=new Set<string>();
 const companyContactChannels: CompanyContactChannel[]=[];
 for(const channel of result.companyContactChannels){
  const emailAddress=validCompanyEmail(channel.emailAddress,domain);if(!emailAddress||seen.has(emailAddress))continue;
  const sourceHost=hostname(channel.sourceUrl);const official=Boolean(domain&&(sourceHost===domain||sourceHost.endsWith(`.${domain}`)));
  if(channel.verificationStatus==="PUBLIC_VERIFIED"&&!official)continue;
  if(channel.verificationStatus==="PATTERN_LIKELY"&&channel.confidence<70)continue;
  seen.add(emailAddress);
  companyContactChannels.push({...channel,emailAddress,department:channel.department?clean(channel.department,180):null,associatedContactName:channel.associatedContactName?clean(channel.associatedContactName,180):null,likelyReader:clean(channel.likelyReader,300),reasonSelected:clean(channel.reasonSelected,600),sourceTitle:channel.sourceTitle?clean(channel.sourceTitle,240):null,evidenceExcerpt:clean(channel.evidenceExcerpt,900)});
 }
 const routes=result.routes.map(route=>{
  const evidence=route.evidence.map(item=>({...item,claim:clean(item.claim,500),sourceTitle:item.sourceTitle?clean(item.sourceTitle,240):null,excerpt:item.excerpt?clean(item.excerpt,900):null,sourceDomain:hostname(item.sourceUrl),verified:allowedSource(item.sourceUrl,item.sourceKind,domain),excerptMatched:Boolean(item.excerpt&&clean(item.excerpt).length>=20)})).filter(item=>item.verified&&item.claim&&item.sourceUrl);
  let channelValue=route.channelValue;
  if(["DIRECT_EMAIL","DEPARTMENT_EMAIL","GENERAL_EMAIL"].includes(route.channelType)) channelValue=validCompanyEmail(channelValue,domain);
  if(route.channelType==="LINKEDIN") channelValue=linkedinProfile(channelValue);
  const channelType=channelValue?route.channelType:"UNKNOWN";
  const personSupported=evidence.some(item=>item.evidenceType==="IDENTITY")&&evidence.some(item=>item.evidenceType==="ROLE");
  return {...route,channelType,channelValue,contactName:personSupported?route.contactName:null,contactRole:personSupported?route.contactRole:null,evidence};
 });
 const relationships=result.relationships.map(rel=>{
  const endpointDomains=[rel.fromEntity.canonicalDomain,rel.toEntity.canonicalDomain].filter((value):value is string=>Boolean(value)).map(value=>value.toLowerCase().replace(/^www\./,""));
  const evidence=rel.evidence.map(item=>{
   const sourceHost=hostname(item.sourceUrl);const body=`${clean(item.claim,500)} ${clean(item.excerpt,900)}`;
   const verified=allowedRelationshipSource(item.sourceUrl,item.sourceKind,domain,endpointDomains);
   const excerptMatched=verified&&Boolean(item.excerpt&&clean(item.excerpt).length>=20)&&relationshipEntityMentioned(rel.fromEntity,body,sourceHost,domain)&&relationshipEntityMentioned(rel.toEntity,body,sourceHost,domain);
   return {...item,claim:clean(item.claim,500),sourceTitle:item.sourceTitle?clean(item.sourceTitle,240):null,excerpt:item.excerpt?clean(item.excerpt,900):null,sourceDomain:sourceHost,verified,excerptMatched};
  }).filter(item=>item.verified&&item.claim&&item.sourceUrl);
  return {...rel,rationale:clean(rel.rationale,700),evidence};
 }).filter(rel=>rel.evidence.length>0);
 return finaliseDeterministicContactRouteAuthority({...result,contacts,companyContactChannels,routes,relationships});
}

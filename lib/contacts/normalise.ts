import type { ContactDiscoveryResult, DiscoveredContact, CompanyContactChannel } from "./schemas";
import { finaliseDeterministicContactRouteAuthority } from "./deterministic-authority";
function clean(value:string|null|undefined,max=900){return(value??"").replace(/\s+/g," ").trim().slice(0,max)}
function hostname(value:string){try{return new URL(value).hostname.toLowerCase().replace(/^www\./,"")}catch{return""}}
function companyDomain(value:string|null|undefined){if(!value)return"";try{return new URL(value).hostname.toLowerCase().replace(/^www\./,"")}catch{return value.toLowerCase().replace(/^www\./,"").split("/")[0]}}
function linkedinProfile(value:string|null|undefined){if(!value)return null;try{const u=new URL(value);const host=u.hostname.toLowerCase().replace(/^www\./,"");if(host!=="linkedin.com"&&!host.endsWith(".linkedin.com"))return null;if(!/^\/in\/[^/?#]+\/?$/i.test(u.pathname))return null;return `https://www.linkedin.com${u.pathname.replace(/\/$/,"")}`}catch{return null}}
function allowedSource(sourceUrl:string,sourceKind:string,officialDomain:string){const host=hostname(sourceUrl);if(!host)return false;if(officialDomain&&(host===officialDomain||host.endsWith(`.${officialDomain}`)))return true;if(["OFFICIAL_LINKEDIN_COMPANY","OFFICIAL_LINKEDIN_PROFILE"].includes(sourceKind))return host==="linkedin.com"||host.endsWith(".linkedin.com");if(sourceKind==="REGULATORY_FILING")return/(^|\.)(gov|gov\.uk|sec\.gov|companieshouse\.gov\.uk)$/.test(host);return false}
function validCompanyEmail(value:string|null|undefined,domain:string){if(!value)return null;const email=value.trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return null;const emailDomain=email.split("@")[1];if(!domain||!(emailDomain===domain||emailDomain.endsWith(`.${domain}`)))return null;return email}
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
  const evidenceQuality=evidence.length?Math.round(evidence.reduce((sum,item)=>sum+item.qualityScore,0)/evidence.length):0;
  const confidence=Math.min(route.confidence,evidence.length?100:45);
  return {...route,channelType,channelValue,contactName:personSupported?route.contactName:null,contactRole:personSupported?route.contactRole:null,evidence,evidenceQuality,confidence};
 });
 return finaliseDeterministicContactRouteAuthority({...result,contacts,companyContactChannels,routes});
}

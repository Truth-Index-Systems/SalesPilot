import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";
import { getGenesisG8FounderCommandCentre } from "@/lib/genesis-g8/founder-command-centre";

type UsageRow={id:string;organisation_id:string;campaign_id:string|null;job_type:string;job_id:string|null;status:string;model:string;estimated_cost_usd:number;actual_cost_usd:number;input_tokens:number|null;output_tokens:number|null;web_search_calls:number;duration_ms:number|null;error_code:string|null;created_at:string;completed_at:string|null};
type Campaign={id:string;organisation_id:string;name:string;status:string;created_at:string};
type Organisation={id:string;name:string};
type VersionRow={id:string;prompt_version:string|null};
type TimelineRow={id:string;organisation_id:string;campaign_id:string;event_type:string;title:string;description:string|null;occurred_at:string};
type CountRow={id:string;organisation_id?:string;campaign_id?:string;status?:string;review_status?:string;job_state?:string;created_at?:string;updated_at?:string};
type OutcomeRow={id:string;organisation_id:string;campaign_id:string;engagement_id:string;opportunity_id:string;channel:string;route_quality:number|null;route_confidence:number|null;outcome:string;outcome_value:number|null;occurred_at:string};
type G8ReviewRow={id:string;entity_id:string;entity_type:string;truth_index:number;confidence:number;coverage:number;reasons_json:unknown;claim_keys_json:unknown;status:string;created_at:string};
type G8EntityRow={id:string;display_name:string|null;canonical_key:string;review_state:string;status:string};
type G8ClaimRow={id:string;entity_id:string;claim_key:string;label:string;criticality:string;minimum_evidence:number};
type G8EvidenceRow={id:string;claim_id:string;direction:string;source_class:string;source_uri:string|null;excerpt:string|null;strength:number;traceability:number;independence:number;observed_at:string;intelligence_channel:string};
type G8ReviewReceiptRow={id:string;action:string;reviewed_at:string};
type LearningRow={id:string;organisation_id:string;campaign_id:string;engagement_id:string;opportunity_id:string;queue_outcome:string;engagement_score:number|null;confidence:number|null;human_action:string|null;edit_distance:number|null;actual_cost_usd:number;estimated_cost_usd:number;total_input_tokens:number;total_output_tokens:number;total_latency_ms:number;commercial_prompt_version:string|null;generation_prompt_version:string|null;review_prompt_version:string|null;commercial_model:string|null;generation_model:string|null;review_model:string|null;created_at:string};

const stageLabels:Record<string,string>={BUSINESS_ANALYSIS:"Business Analysis",COMPANY_DISCOVERY:"Company Intelligence",CONTACT_DISCOVERY:"Buyer Intelligence",OPPORTUNITY_ANALYSIS:"Opportunity Intelligence",COMMERCIAL_REASONING:"Commercial Reasoning",OUTREACH:"Outreach Generation",SELF_REVIEW:"AI Self Review",REPLY_INTELLIGENCE:"Reply Intelligence"};
const effectiveCost=(row:UsageRow)=>Number(row.status==="SUCCEEDED"?row.actual_cost_usd:row.estimated_cost_usd);
const dayKey=(value:string)=>value.slice(0,10);

export async function getFounderDashboard(rangeDays=7){
  const g8CommandCentrePromise=getGenesisG8FounderCommandCentre(rangeDays).catch(error=>{console.warn("Genesis G8 founder command centre unavailable",error instanceof Error?error.message:"unknown");return null;});
  const since=new Date(Date.now()-Math.max(1,rangeDays)*86400000).toISOString();
  const [usage,campaigns,organisations,commercial,drafts,reviews,timeline,companies,contacts,opportunities,engagements,queue,learning,outcomes,g8Reviews,g8Entities,g8ReviewReceipts]=await Promise.all([
    databaseRequest<UsageRow[]>(`ai_usage_ledger?select=id,organisation_id,campaign_id,job_type,job_id,status,model,estimated_cost_usd,actual_cost_usd,input_tokens,output_tokens,web_search_calls,duration_ms,error_code,created_at,completed_at&created_at=gte.${encodeURIComponent(since)}&order=created_at.desc&limit=5000`),
    databaseRequest<Campaign[]>(`campaigns?select=id,organisation_id,name,status,created_at&order=created_at.desc&limit=2000`),
    databaseRequest<Organisation[]>(`organisations?select=id,name&order=created_at.asc&limit=500`),
    databaseRequest<VersionRow[]>(`engagement_commercial_analyses?select=id,prompt_version&limit=5000`),
    databaseRequest<VersionRow[]>(`engagement_drafts?select=id,prompt_version&limit=5000`),
    databaseRequest<VersionRow[]>(`engagement_draft_reviews?select=id,prompt_version&limit=5000`),
    databaseRequest<TimelineRow[]>(`campaign_timeline?select=id,organisation_id,campaign_id,event_type,title,description,occurred_at&order=occurred_at.desc&limit=20`),
    databaseRequest<CountRow[]>(`companies?select=id,review_status&limit=10000`),
    databaseRequest<CountRow[]>(`contacts?select=id,review_status&limit=10000`),
    databaseRequest<CountRow[]>(`opportunities?select=id,organisation_id,campaign_id,status,created_at,updated_at&limit=10000`),
    databaseRequest<CountRow[]>(`opportunity_engagements?select=id,organisation_id,campaign_id,status,created_at,updated_at&limit=10000`),
    databaseRequest<CountRow[]>(`engagement_send_queue?select=id,status&limit=10000`),
    databaseRequest<LearningRow[]>(`engagement_learning_records?select=id,organisation_id,campaign_id,engagement_id,opportunity_id,queue_outcome,engagement_score,confidence,human_action,edit_distance,actual_cost_usd,estimated_cost_usd,total_input_tokens,total_output_tokens,total_latency_ms,commercial_prompt_version,generation_prompt_version,review_prompt_version,commercial_model,generation_model,review_model,created_at&created_at=gte.${encodeURIComponent(since)}&order=created_at.desc&limit=10000`),
    databaseRequest<OutcomeRow[]>(`engagement_outcomes?select=id,organisation_id,campaign_id,engagement_id,opportunity_id,channel,route_quality,route_confidence,outcome,outcome_value,occurred_at&occurred_at=gte.${encodeURIComponent(since)}&order=occurred_at.desc&limit=10000`),
    databaseRequest<G8ReviewRow[]>(`genesis_g8_founder_review_queue?select=id,entity_id,entity_type,truth_index,confidence,coverage,reasons_json,claim_keys_json,status,created_at&status=eq.OPEN&order=created_at.asc&limit=50`),
    databaseRequest<G8EntityRow[]>(`genesis_g8_intelligence_entities?select=id,display_name,canonical_key,review_state,status&limit=10000`),
    databaseRequest<G8ReviewReceiptRow[]>(`genesis_g8_human_review_receipts?select=id,action,reviewed_at&reviewed_at=gte.${encodeURIComponent(since)}&order=reviewed_at.desc&limit=5000`),
  ]);
  const g8CommandCentre=await g8CommandCentrePromise;
  const openEntityIds=[...new Set(g8Reviews.map(row=>row.entity_id))];
  const g8Claims=openEntityIds.length?await databaseRequest<G8ClaimRow[]>(`genesis_g8_intelligence_claims?select=id,entity_id,claim_key,label,criticality,minimum_evidence&entity_id=in.(${openEntityIds.join(",")})&limit=5000`).catch(()=>[]):[];
  const claimIds=g8Claims.map(row=>row.id);
  const g8Evidence=claimIds.length?await databaseRequest<G8EvidenceRow[]>(`genesis_g8_intelligence_evidence?select=id,claim_id,direction,source_class,source_uri,excerpt,strength,traceability,independence,observed_at,intelligence_channel&claim_id=in.(${claimIds.join(",")})&order=observed_at.desc&limit=10000`).catch(()=>[]):[];
  const campaignMap=new Map(campaigns.map(r=>[r.id,r]));
  const orgMap=new Map(organisations.map(r=>[r.id,r.name]));
  const promptMap=new Map<string,string>();
  for(const row of [...commercial,...drafts,...reviews]) if(row.prompt_version) promptMap.set(row.id,row.prompt_version);
  const rows=usage.map(row=>({
    ...row,
    stage:stageLabels[row.job_type]??row.job_type.replaceAll("_"," "),
    cost:effectiveCost(row),
    promptVersion:row.job_id?promptMap.get(row.job_id)??"Legacy / unversioned":"Legacy / unversioned",
    campaignName:row.campaign_id?campaignMap.get(row.campaign_id)?.name??"Unknown campaign":"Platform-wide",
    organisationName:orgMap.get(row.organisation_id)??"Unknown workspace",
  }));
  const totalCost=rows.reduce((n,r)=>n+r.cost,0);
  const successful=rows.filter(r=>r.status==="SUCCEEDED");
  const totalTokens=rows.reduce((n,r)=>n+(r.input_tokens??0)+(r.output_tokens??0),0);
  const todayKey=new Date().toISOString().slice(0,10);
  const today=rows.filter(r=>dayKey(r.created_at)===todayKey);
  const stageGroups=new Map<string,typeof rows>();
  for(const row of rows) stageGroups.set(row.stage,[...(stageGroups.get(row.stage)??[]),row]);
  const stages=[...stageGroups.entries()].map(([stage,items])=>({
    stage,calls:items.length,tokens:items.reduce((n,r)=>n+(r.input_tokens??0)+(r.output_tokens??0),0),cost:items.reduce((n,r)=>n+r.cost,0),
    latency:Math.round(items.filter(r=>r.duration_ms!=null).reduce((n,r)=>n+(r.duration_ms??0),0)/Math.max(1,items.filter(r=>r.duration_ms!=null).length)),
    searches:items.reduce((n,r)=>n+r.web_search_calls,0),successRate:Math.round(items.filter(r=>r.status==="SUCCEEDED").length/Math.max(1,items.length)*100)
  })).sort((a,b)=>b.cost-a.cost);
  const campaignGroups=new Map<string,typeof rows>();
  for(const row of rows) if(row.campaign_id) campaignGroups.set(row.campaign_id,[...(campaignGroups.get(row.campaign_id)??[]),row]);
  const campaignCosts=[...campaignGroups.entries()].map(([id,items])=>({id,name:campaignMap.get(id)?.name??"Unknown campaign",organisation:orgMap.get(campaignMap.get(id)?.organisation_id??"")??"Unknown workspace",calls:items.length,tokens:items.reduce((n,r)=>n+(r.input_tokens??0)+(r.output_tokens??0),0),cost:items.reduce((n,r)=>n+r.cost,0)})).sort((a,b)=>b.cost-a.cost).slice(0,10);
  const promptGroups=new Map<string,typeof rows>();
  for(const row of rows) promptGroups.set(row.promptVersion,[...(promptGroups.get(row.promptVersion)??[]),row]);
  const prompts=[...promptGroups.entries()].map(([prompt,items])=>({prompt,calls:items.length,avgTokens:Math.round(items.reduce((n,r)=>n+(r.input_tokens??0)+(r.output_tokens??0),0)/Math.max(1,items.length)),avgCost:items.reduce((n,r)=>n+r.cost,0)/Math.max(1,items.length),avgLatency:Math.round(items.reduce((n,r)=>n+(r.duration_ms??0),0)/Math.max(1,items.filter(r=>r.duration_ms!=null).length))})).sort((a,b)=>b.avgCost-a.avgCost).slice(0,12);
  const modelGroups=new Map<string,typeof rows>();
  for(const row of rows) modelGroups.set(row.model,[...(modelGroups.get(row.model)??[]),row]);
  const models=[...modelGroups.entries()].map(([model,items])=>({model,calls:items.length,tokens:items.reduce((n,r)=>n+(r.input_tokens??0)+(r.output_tokens??0),0),cost:items.reduce((n,r)=>n+r.cost,0),latency:Math.round(items.reduce((n,r)=>n+(r.duration_ms??0),0)/Math.max(1,items.filter(r=>r.duration_ms!=null).length))})).sort((a,b)=>b.cost-a.cost);
  const daily=[] as {date:string;cost:number;calls:number;tokens:number}[];
  for(let offset=rangeDays-1;offset>=0;offset--){const d=new Date(Date.now()-offset*86400000).toISOString().slice(0,10);const items=rows.filter(r=>dayKey(r.created_at)===d);daily.push({date:d,cost:items.reduce((n,r)=>n+r.cost,0),calls:items.length,tokens:items.reduce((n,r)=>n+(r.input_tokens??0)+(r.output_tokens??0),0)});}
  const optimisation=stages.slice(0,3).map(stage=>({stage:stage.stage,signal:stage.tokens/Math.max(1,stage.calls),message:stage.calls?`Average ${Math.round(stage.tokens/stage.calls).toLocaleString("en-GB")} tokens per call. Prioritise context compaction here first.`:"No calls recorded yet."}));

  const rangeOpportunities=opportunities.filter(r=>r.created_at && r.created_at>=since);
  const completedOpportunities=rangeOpportunities.filter(r=>["APPROVED","ENGAGED"].includes(r.status??""));
  const rangeEngagements=engagements.filter(r=>r.created_at && r.created_at>=since);
  const reviewReadyEngagements=rangeEngagements.filter(r=>["DRAFT_REVIEW","APPROVED_TO_SEND","QUEUED_FOR_SEND","SENT"].includes(r.status??""));
  const completedJourneys=learning.length;
  const learningActualCost=learning.reduce((n,r)=>n+Number(r.actual_cost_usd||0),0);
  const learningEstimatedCost=learning.reduce((n,r)=>n+Number(r.estimated_cost_usd||0),0);
  const attributedJourneyCost=learningActualCost>0?learningActualCost:learningEstimatedCost;
  const costPerOpportunity=totalCost/Math.max(1,completedOpportunities.length);
  const costPerReviewReady=totalCost/Math.max(1,reviewReadyEngagements.length);
  const costPerCompletedJourney=attributedJourneyCost/Math.max(1,completedJourneys);
  const opportunitiesPerDollar=completedOpportunities.length/Math.max(totalCost,0.000001);
  const reviewReadyPerDollar=reviewReadyEngagements.length/Math.max(totalCost,0.000001);
  const completedJourneysPerDollar=completedJourneys/Math.max(attributedJourneyCost,0.000001);

  const campaignEconomics=campaigns.map(campaign=>{
    const campaignRows=rows.filter(r=>r.campaign_id===campaign.id);
    const campaignSpend=campaignRows.reduce((n,r)=>n+r.cost,0);
    const campaignOpportunities=completedOpportunities.filter(r=>r.campaign_id===campaign.id).length;
    const campaignReviewReady=reviewReadyEngagements.filter(r=>r.campaign_id===campaign.id).length;
    const campaignLearning=learning.filter(r=>r.campaign_id===campaign.id);
    return {id:campaign.id,name:campaign.name,organisation:orgMap.get(campaign.organisation_id)??"Unknown workspace",spend:campaignSpend,requests:campaignRows.length,opportunities:campaignOpportunities,reviewReady:campaignReviewReady,completedJourneys:campaignLearning.length,costPerOpportunity:campaignOpportunities?campaignSpend/campaignOpportunities:null,costPerReviewReady:campaignReviewReady?campaignSpend/campaignReviewReady:null};
  }).filter(r=>r.spend>0||r.opportunities>0||r.reviewReady>0).sort((a,b)=>b.spend-a.spend).slice(0,20);

  const channelGroups=new Map<string,OutcomeRow[]>();
  for(const outcome of outcomes) channelGroups.set(outcome.channel,[...(channelGroups.get(outcome.channel)??[]),outcome]);
  const channelLearning=[...channelGroups.entries()].map(([channel,items])=>{
    const engagements=new Set(items.map(item=>item.engagement_id));
    const positive=new Set(items.filter(item=>["REPLIED","MEETING_BOOKED","QUALIFIED","WON"].includes(item.outcome)).map(item=>item.engagement_id));
    const meetings=new Set(items.filter(item=>["MEETING_BOOKED","QUALIFIED","WON"].includes(item.outcome)).map(item=>item.engagement_id));
    const wins=new Set(items.filter(item=>item.outcome==="WON").map(item=>item.engagement_id));
    const quality=items.map(item=>item.route_quality).filter((value):value is number=>value!=null);
    return {channel,engagements:engagements.size,responses:positive.size,meetings:meetings.size,wins:wins.size,responseRate:engagements.size?Math.round(positive.size/engagements.size*100):0,meetingRate:engagements.size?Math.round(meetings.size/engagements.size*100):0,averageRouteQuality:quality.length?Math.round(quality.reduce((a,b)=>a+b,0)/quality.length):0,wonValue:items.filter(item=>item.outcome==="WON").reduce((sum,item)=>sum+Number(item.outcome_value??0),0),sampleReady:engagements.size>=5};
  }).sort((a,b)=>b.responseRate-a.responseRate||b.engagements-a.engagements);
  const outcomeTotals={recorded:outcomes.length,responses:new Set(outcomes.filter(item=>["REPLIED","MEETING_BOOKED","QUALIFIED","WON"].includes(item.outcome)).map(item=>item.engagement_id)).size,meetings:new Set(outcomes.filter(item=>["MEETING_BOOKED","QUALIFIED","WON"].includes(item.outcome)).map(item=>item.engagement_id)).size,wins:new Set(outcomes.filter(item=>item.outcome==="WON").map(item=>item.engagement_id)).size,wonValue:outcomes.filter(item=>item.outcome==="WON").reduce((sum,item)=>sum+Number(item.outcome_value??0),0)};
  const g8EntityMap=new Map(g8Entities.map(entity=>[entity.id,entity]));
  const claimsByEntity=new Map<string,G8ClaimRow[]>();
  for(const claim of g8Claims) claimsByEntity.set(claim.entity_id,[...(claimsByEntity.get(claim.entity_id)??[]),claim]);
  const evidenceByClaim=new Map<string,G8EvidenceRow[]>();
  for(const evidence of g8Evidence) evidenceByClaim.set(evidence.claim_id,[...(evidenceByClaim.get(evidence.claim_id)??[]),evidence]);
  const g8ReviewQueue=g8Reviews.map(review=>{
    const entity=g8EntityMap.get(review.entity_id);
    const entityClaims=claimsByEntity.get(review.entity_id)??[];
    const requestedClaimKeys=Array.isArray(review.claim_keys_json)?review.claim_keys_json.filter((value):value is string=>typeof value==="string"):[];
    const evidence=entityClaims.flatMap(claim=>(evidenceByClaim.get(claim.id)??[]).map(item=>({
      id:item.id,claimLabel:claim.label,direction:item.direction,sourceUri:item.source_uri,excerpt:item.excerpt,sourceClass:item.source_class,
      quality:Number(item.strength||0)*Number(item.traceability||0)*Number(item.independence||0),observedAt:item.observed_at,channel:item.intelligence_channel
    }))).sort((a,b)=>new Date(b.observedAt).getTime()-new Date(a.observedAt).getTime());
    const canonicalKey=entity?.canonical_key??review.entity_id;
    const companyLabel=canonicalKey.includes("::")?canonicalKey.split("::")[0]:canonicalKey;
    const reasons=Array.isArray(review.reasons_json)?review.reasons_json:[];
    const requestedLabels=entityClaims.filter(claim=>requestedClaimKeys.includes(claim.claim_key)).map(claim=>claim.label);
    const whyItMatters=requestedLabels.length?`Genesis needs a decision on ${requestedLabels.join(", ")}. The attached evidence has not yet produced a sufficiently reliable autonomous decision.`:`Genesis has explicitly escalated this ${review.entity_type.toLowerCase()} because its current Truth state requires human judgement before normal eligibility can continue.`;
    return {...review,displayName:entity?.display_name??canonicalKey,canonicalKey,companyLabel,reasons,claimKeys:requestedClaimKeys,evidence,whyItMatters};
  });
  const g8ReviewSummary={open:g8ReviewQueue.length,approved:g8ReviewReceipts.filter(row=>row.action==="APPROVE").length,corrected:g8ReviewReceipts.filter(row=>row.action==="CORRECT").length,rejected:g8ReviewReceipts.filter(row=>row.action==="REJECT").length,moreResearch:g8ReviewReceipts.filter(row=>row.action==="MORE_RESEARCH").length};

  const successfulWithCost=successful.filter(r=>r.actual_cost_usd!=null && Number(r.actual_cost_usd)>=0).length;
  const miniOnly=rows.length>0 && rows.every(r=>r.model.toLowerCase().includes("gpt-5-mini"));
  const versionedG4=rows.filter(r=>["COMMERCIAL_REASONING","OUTREACH","SELF_REVIEW"].includes(r.job_type));
  const promptCoverage=versionedG4.length?versionedG4.filter(r=>r.promptVersion!=="Legacy / unversioned").length/versionedG4.length:1;
  const releaseGate=[
    {key:"journey",label:"Completed production journey recorded",passed:completedJourneys>0,detail:completedJourneys?`${completedJourneys} immutable learning snapshot${completedJourneys===1?"":"s"}`:"Complete one approval-to-queue journey"},
    {key:"cost",label:"Every successful request has cost telemetry",passed:successful.length>0&&successfulWithCost===successful.length,detail:`${successfulWithCost}/${successful.length} successful requests costed`},
    {key:"model",label:"All production calls use GPT-5 mini",passed:miniOnly,detail:rows.length?`${new Set(rows.map(r=>r.model)).size} model${new Set(rows.map(r=>r.model)).size===1?"":"s"} observed`:"No requests in period"},
    {key:"prompt",label:"G4 prompt versions are attributable",passed:promptCoverage===1,detail:`${Math.round(promptCoverage*100)}% prompt-version coverage`},
    {key:"economics",label:"Cost per completed journey is measurable",passed:completedJourneys>0&&costPerCompletedJourney>=0,detail:completedJourneys?`$${costPerCompletedJourney.toFixed(4)} per completed journey`:"Awaiting completed journey"},
  ];

  return {
    generatedAt:new Date().toISOString(),rangeDays,
    totals:{todayCost:today.reduce((n,r)=>n+r.cost,0),todayRequests:today.length,totalCost,requests:rows.length,totalTokens,avgCost:totalCost/Math.max(1,successful.length),avgTokens:Math.round(totalTokens/Math.max(1,successful.length)),avgLatency:Math.round(successful.reduce((n,r)=>n+(r.duration_ms??0),0)/Math.max(1,successful.filter(r=>r.duration_ms!=null).length)),webSearches:rows.reduce((n,r)=>n+r.web_search_calls,0)},
    pipeline:{workspaces:organisations.length,campaigns:campaigns.filter(r=>r.status!=="ARCHIVED").length,companies:companies.length,approvedCompanies:companies.filter(r=>r.review_status==="APPROVED").length,contacts:contacts.length,approvedContacts:contacts.filter(r=>r.review_status==="APPROVED").length,opportunities:opportunities.length,approvedOpportunities:opportunities.filter(r=>r.status==="APPROVED"||r.status==="ENGAGED").length,engagements:engagements.length,queued:queue.filter(r=>r.status==="READY"||r.status==="QUEUED").length,learning:learning.length},
    stages,campaignCosts,prompts,models,daily,optimisation,
    economics:{completedOpportunities:completedOpportunities.length,reviewReadyEngagements:reviewReadyEngagements.length,completedJourneys,costPerOpportunity,costPerReviewReady,costPerCompletedJourney,opportunitiesPerDollar,reviewReadyPerDollar,completedJourneysPerDollar,projectedOpportunitiesForFive:opportunitiesPerDollar*5,projectedReviewReadyForFive:reviewReadyPerDollar*5,projectedCompletedJourneysForFive:completedJourneysPerDollar*5,attributedJourneyCost},
    campaignEconomics,channelLearning,outcomeTotals,g8ReviewQueue,g8ReviewSummary,g8CommandCentre,releaseGate,releaseReady:releaseGate.every(item=>item.passed),
    highest:[...rows].sort((a,b)=>b.cost-a.cost).slice(0,12),
    timeline:timeline.map(row=>({...row,campaignName:campaignMap.get(row.campaign_id)?.name??"Unknown campaign",organisationName:orgMap.get(row.organisation_id)??"Unknown workspace"}))
  };
}

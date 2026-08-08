-- MarketRoute Genesis G4.6.2: channel-specific AI content generation.

alter table public.engagement_drafts add column if not exists channel_content_json jsonb not null default '{}'::jsonb;
alter table public.engagement_drafts add column if not exists execution_instruction text;

insert into public.engagement_prompt_versions(version,purpose,system_prompt,template_json,schema_version,model,active)
values('engagement-channel-content/v1','CHANNEL_CONTENT','Channel-native engagement content generated from the recommended access route.',jsonb_build_object('channels',jsonb_build_array('EMAIL','LINKEDIN','WEBSITE_FORM','PHONE','REFERRAL','PROCUREMENT')),'engagement-channel-content/v1',null,true)
on conflict(version) do update set system_prompt=excluded.system_prompt,template_json=excluded.template_json,schema_version=excluded.schema_version,active=true;

create or replace function public.claim_engagement_outreach_generation(p_scheduler_run_id uuid)
returns table(draft_id uuid,organisation_id uuid,campaign_id uuid,engagement_id uuid,context_json jsonb)
language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_row public.engagement_drafts%rowtype;
begin
  if not exists(select 1 from public.pipeline_scheduler_runs where id=p_scheduler_run_id) then raise exception 'scheduler run required'; end if;

  insert into public.engagement_drafts(organisation_id,campaign_id,engagement_id,opportunity_id,commercial_analysis_id)
  select e.organisation_id,e.campaign_id,e.id,e.opportunity_id,a.id
  from public.opportunity_engagements e
  join public.opportunities o on o.id=e.opportunity_id and o.status='APPROVED'
  join public.engagement_commercial_analyses a on a.engagement_id=e.id and a.status='COMPLETE'
  join public.ai_governance_policies g on g.organisation_id=e.organisation_id and g.autonomy_enabled=true
  where e.status='READY_FOR_DRAFT' and coalesce(e.primary_channel,e.channel_type)<>'NONE'
  on conflict on constraint engagement_drafts_engagement_id_key do nothing;

  select d.id into v_id
  from public.engagement_drafts d
  join public.opportunity_engagements e on e.id=d.engagement_id and e.status='READY_FOR_DRAFT' and coalesce(e.primary_channel,e.channel_type)<>'NONE'
  join public.engagement_commercial_analyses a on a.id=d.commercial_analysis_id and a.status='COMPLETE'
  where d.attempt_count<5 and (
    (d.status='PENDING' and coalesce(d.next_attempt_at,now())<=now()) or
    (d.status='FAILED_RETRYABLE' and coalesce(d.next_attempt_at,now())<=now()) or
    (d.status='RUNNING' and d.lease_expires_at<now())
  )
  order by case d.status when 'PENDING' then 0 when 'FAILED_RETRYABLE' then 1 else 2 end,d.created_at
  for update of d skip locked limit 1;
  if v_id is null then return; end if;

  update public.engagement_drafts
  set status='RUNNING',attempt_count=attempt_count+1,scheduler_run_id=p_scheduler_run_id,
      claimed_at=now(),lease_expires_at=now()+interval '5 minutes',last_error=null,updated_at=now()
  where id=v_id returning * into v_row;

  insert into public.opportunity_engagement_history(organisation_id,campaign_id,engagement_id,opportunity_id,event_type,previous_status,next_status,metadata_json)
  select v_row.organisation_id,v_row.campaign_id,v_row.engagement_id,v_row.opportunity_id,'DRAFT_GENERATION_STARTED',e.status,e.status,
         jsonb_build_object('draftId',v_row.id,'schedulerRunId',p_scheduler_run_id,'attempt',v_row.attempt_count)
  from public.opportunity_engagements e where e.id=v_row.engagement_id;

  return query
  select v_row.id,v_row.organisation_id,v_row.campaign_id,v_row.engagement_id,
  jsonb_build_object(
    'engagement',jsonb_build_object('id',e.id,'channelType',e.channel_type,'primaryChannel',coalesce(e.primary_channel,e.channel_type),'secondaryChannel',e.secondary_channel,'fallbackChannel',e.fallback_channel,'entryStrategy',e.entry_strategy,'recommendationReason',e.recommendation_reason,'strategyConfidence',e.strategy_confidence,'recipientName',e.recipient_name,'recipientRole',e.recipient_role,'recipientEmail',e.recipient_email,'linkedinProfileUrl',e.linkedin_profile_url,'sourceOpportunityScore',e.source_opportunity_score),
    'commercialAnalysis',a.output_json,
    'opportunity',jsonb_build_object('id',o.id,'score',o.opportunity_score,'buyingReason',o.buying_reason,'operationalPain',o.operational_pain,'recommendedAction',o.recommended_action,'scoreExplanation',o.score_explanation_json),
    'campaign',jsonb_build_object('id',ca.id,'name',ca.name,'objective',ca.objective,'audience',cfg.audience,'buyerRoles',cfg.buyer_roles_json,'messageAngle',cfg.message_angle,'why',cfg.why_json),
    'businessDna',jsonb_build_object('profileId',bp.id,'companyName',bp.company_name,'summary',bp.summary,'industry',bp.industry,'payload',bpv.payload_json),
    'company',jsonb_build_object('id',co.id,'name',co.company_name,'websiteUrl',co.website_url,'industry',co.industry,'country',co.country,'summary',co.summary,'confidence',co.confidence),
    'buyer',case when ct.id is null then null else jsonb_build_object('id',ct.id,'fullName',ct.full_name,'roleTitle',ct.role_title,'department',ct.department,'location',ct.location,'reasonSelected',ct.reason_selected,'confidence',ct.overall_confidence,'unknowns',ct.unknowns_json,'riskFlags',ct.risk_flags_json) end,
    'companyEvidence',coalesce((select jsonb_agg(jsonb_build_object('id',ce.id,'claim',ce.claim,'sourceUrl',ce.source_url,'sourceTitle',ce.source_title,'excerpt',ce.excerpt)) from public.company_evidence ce where ce.company_id=co.id),'[]'::jsonb),
    'contactEvidence',coalesce((select jsonb_agg(jsonb_build_object('id',cne.id,'type',cne.evidence_type,'claim',cne.claim,'sourceUrl',cne.source_url,'sourceTitle',cne.source_title,'excerpt',cne.excerpt,'verified',cne.verified,'qualityScore',cne.quality_score)) from public.contact_evidence cne where cne.contact_id=ct.id),'[]'::jsonb)
  )
  from public.engagement_drafts d
  join public.opportunity_engagements e on e.id=d.engagement_id
  join public.engagement_commercial_analyses a on a.id=d.commercial_analysis_id
  join public.opportunities o on o.id=e.opportunity_id
  join public.campaigns ca on ca.id=e.campaign_id
  join public.campaign_config_versions cfg on cfg.campaign_id=ca.id and cfg.version_number=ca.current_config_version
  join public.business_profiles bp on bp.id=ca.business_profile_id
  left join lateral (select payload_json from public.business_profile_versions v where v.business_profile_id=bp.id order by version_number desc limit 1) bpv on true
  join public.companies co on co.id=e.company_id
  left join public.contacts ct on ct.id=e.contact_id
  where d.id=v_id;
end $$;

create or replace function public.complete_engagement_outreach_generation(
  p_draft_id uuid,p_output_json jsonb,p_prompt_version text,p_schema_version text,p_confidence integer,p_model text,
  p_input_tokens integer,p_output_tokens integer,p_duration_ms integer,p_response_id text
) returns void language plpgsql security definer set search_path=public as $$
declare v public.engagement_drafts%rowtype; v_event_id uuid;
begin
  select * into v from public.engagement_drafts where id=p_draft_id for update;
  if v.id is null then raise exception 'engagement draft missing'; end if;
  if v.status='COMPLETE' then return; end if;
  if v.status<>'RUNNING' then raise exception 'engagement draft not running'; end if;

  update public.engagement_drafts set
    status='COMPLETE',channel_content_json=coalesce(p_output_json->'content','{}'::jsonb),execution_instruction=p_output_json->>'executionInstruction',
    subject=coalesce(p_output_json->'content'->>'subject',p_output_json->'content'->>'formSubject',initcap(lower(replace(p_output_json->>'channel','_',' ')))||' engagement'),
    opening=coalesce(p_output_json->'content'->>'emailBody',p_output_json->'content'->>'directMessage',p_output_json->'content'->>'formMessage',p_output_json->'content'->>'callOpening',p_output_json->'content'->>'referralRequest',p_output_json->'content'->>'procurementIntroduction'),personalisation=p_output_json->>'personalisation',
    buying_angle=p_output_json->>'buyingAngle',primary_pain=p_output_json->>'primaryPain',value_proposition=p_output_json->>'valueProposition',
    supporting_evidence_json=coalesce(p_output_json->'supportingEvidence','[]'::jsonb),call_to_action=p_output_json->>'callToAction',
    tone=p_output_json->>'tone',reasoning=p_output_json->>'reasoning',limitations_json=coalesce(p_output_json->'limitations','[]'::jsonb),
    confidence=least(100,greatest(0,p_confidence)),prompt_version=p_prompt_version,schema_version=p_schema_version,model=p_model,
    input_tokens=p_input_tokens,output_tokens=p_output_tokens,duration_ms=p_duration_ms,response_id=p_response_id,output_json=p_output_json,
    completed_at=now(),lease_expires_at=null,updated_at=now()
  where id=v.id;

  update public.opportunity_engagements set status='DRAFT_READY',generation_version=p_schema_version,prompt_version=p_prompt_version,
    confidence=least(100,greatest(0,p_confidence)),updated_at=now() where id=v.engagement_id and status='READY_FOR_DRAFT';

  insert into public.engagement_generation_history(organisation_id,campaign_id,engagement_id,opportunity_id,generation_version,prompt_version,model,output_json,confidence,metadata_json)
  values(v.organisation_id,v.campaign_id,v.engagement_id,v.opportunity_id,p_schema_version,p_prompt_version,p_model,p_output_json,p_confidence,
    jsonb_build_object('generationType','CHANNEL_CONTENT','channel',p_output_json->>'channel','draftId',v.id,'commercialAnalysisId',v.commercial_analysis_id,'inputTokens',p_input_tokens,'outputTokens',p_output_tokens,'durationMs',p_duration_ms,'responseId',p_response_id));

  insert into public.opportunity_engagement_history(organisation_id,campaign_id,engagement_id,opportunity_id,event_type,previous_status,next_status,metadata_json)
  values(v.organisation_id,v.campaign_id,v.engagement_id,v.opportunity_id,'DRAFT_CREATED','READY_FOR_DRAFT','DRAFT_READY',
    jsonb_build_object('draftId',v.id,'confidence',p_confidence,'promptVersion',p_prompt_version));

  insert into public.campaign_timeline(organisation_id,campaign_id,event_type,title,description,visibility,metadata_json)
  values(v.organisation_id,v.campaign_id,'DRAFT_GENERATED','Channel-specific engagement prepared',
    'MarketRoute has prepared evidence-backed content for the recommended engagement channel.','CUSTOMER',
    jsonb_build_object('engagementId',v.engagement_id,'opportunityId',v.opportunity_id,'draftId',v.id,'confidence',p_confidence));

  v_event_id:=gen_random_uuid();
  insert into public.domain_outbox(organisation_id,event_id,event_type,aggregate_type,aggregate_id,payload_json,occurred_at)
  values(v.organisation_id,v_event_id,'EngagementDraftGenerated','OpportunityEngagement',v.engagement_id,
    jsonb_build_object('campaignId',v.campaign_id,'opportunityId',v.opportunity_id,'draftId',v.id,'status','DRAFT_READY','promptVersion',p_prompt_version,'confidence',p_confidence),now());
end $$;

create or replace function public.run_engagement_queue_builder(p_scheduler_run_id uuid)
returns table(inspected integer,queued integer,held integer,already_queued integer)
language plpgsql security definer set search_path=public as $$
declare v record; v_tz record; v_draft_id uuid; v_address text; v_scheduled timestamptz; v_inspected integer:=0; v_queued integer:=0; v_held integer:=0; v_existing integer:=0; v_event_id uuid;
begin
  if not exists(select 1 from public.pipeline_scheduler_runs where id=p_scheduler_run_id) then raise exception 'scheduler run required'; end if;

  for v in
    select e.*,c.location contact_location,co.country company_country
    from public.opportunity_engagements e
    left join public.contacts c on c.id=e.contact_id
    join public.companies co on co.id=e.company_id
    where e.status='APPROVED_TO_SEND' and coalesce(e.primary_channel,e.channel_type)='EMAIL'
    order by e.source_opportunity_rank,e.updated_at
    for update of e skip locked
  loop
    v_inspected:=v_inspected+1;
    if exists(select 1 from public.engagement_send_queue q where q.engagement_id=v.id) then
      v_existing:=v_existing+1; continue;
    end if;
    select id into v_draft_id from public.engagement_drafts where engagement_id=v.id and status='COMPLETE' order by completed_at desc limit 1;
    if v_draft_id is null then
      insert into public.engagement_queue_holds(organisation_id,campaign_id,engagement_id,opportunity_id,reason_code,reason_message,last_checked_at)
      values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,'DRAFT_MISSING','Approved engagement has no completed draft.',now())
      on conflict on constraint engagement_queue_holds_engagement_id_reason_code_key do update set last_checked_at=now(),resolved_at=null;
      v_held:=v_held+1; continue;
    end if;
    v_address:=nullif(trim(coalesce(v.recipient_email,'')),'');
    if coalesce(v.primary_channel,v.channel_type)<>'EMAIL' then
      insert into public.engagement_queue_holds(organisation_id,campaign_id,engagement_id,opportunity_id,reason_code,reason_message,last_checked_at)
      values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,'UNSUPPORTED_CHANNEL','Approved engagement does not have a supported sending channel.',now())
      on conflict on constraint engagement_queue_holds_engagement_id_reason_code_key do update set last_checked_at=now(),resolved_at=null;
      v_held:=v_held+1; continue;
    end if;
    if v_address is null then
      insert into public.engagement_queue_holds(organisation_id,campaign_id,engagement_id,opportunity_id,reason_code,reason_message,last_checked_at)
      values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,'MISSING_ROUTE','Approved engagement no longer has a usable recipient route.',now())
      on conflict on constraint engagement_queue_holds_engagement_id_reason_code_key do update set last_checked_at=now(),resolved_at=null;
      v_held:=v_held+1; continue;
    end if;
    select * into v_tz from public.resolve_engagement_timezone(v.contact_location,v.company_country) limit 1;
    if v_tz.timezone_name is null then
      insert into public.engagement_queue_holds(organisation_id,campaign_id,engagement_id,opportunity_id,reason_code,reason_message,metadata_json,last_checked_at)
      values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,'TIMEZONE_UNCERTAIN','Recipient timezone could not be established with sufficient confidence.',jsonb_build_object('contactLocation',v.contact_location,'companyCountry',v.company_country),now())
      on conflict on constraint engagement_queue_holds_engagement_id_reason_code_key do update set metadata_json=excluded.metadata_json,last_checked_at=now(),resolved_at=null;
      v_held:=v_held+1; continue;
    end if;
    v_scheduled:=public.next_recipient_send_time(v_tz.timezone_name,now());
    insert into public.engagement_send_queue(organisation_id,campaign_id,engagement_id,opportunity_id,draft_id,contact_id,channel_type,recipient_address,recipient_timezone,timezone_source,timezone_confidence,scheduled_for,scheduler_run_id)
    values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,v_draft_id,v.contact_id,v.channel_type,v_address,v_tz.timezone_name,v_tz.source_name,v_tz.confidence_name,v_scheduled,p_scheduler_run_id);
    update public.engagement_queue_holds set resolved_at=now(),last_checked_at=now() where engagement_id=v.id and resolved_at is null;
    update public.opportunity_engagements set status='QUEUED_FOR_SEND',updated_at=now() where id=v.id;
    insert into public.opportunity_engagement_history(organisation_id,campaign_id,engagement_id,opportunity_id,event_type,previous_status,next_status,metadata_json)
    values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,'QUEUED','APPROVED_TO_SEND','QUEUED_FOR_SEND',jsonb_build_object('draftId',v_draft_id,'scheduledFor',v_scheduled,'recipientTimezone',v_tz.timezone_name,'timezoneSource',v_tz.source_name,'schedulerRunId',p_scheduler_run_id));
    insert into public.campaign_timeline(organisation_id,campaign_id,event_type,title,description,visibility,metadata_json)
    values(v.organisation_id,v.campaign_id,'OUTREACH_QUEUED','Outreach queued','The approved outreach is queued for the recipient’s local sending window.','CUSTOMER',jsonb_build_object('engagementId',v.id,'opportunityId',v.opportunity_id,'scheduledFor',v_scheduled,'recipientTimezone',v_tz.timezone_name));
    v_event_id:=gen_random_uuid();
    insert into public.domain_outbox(organisation_id,event_id,event_type,aggregate_type,aggregate_id,payload_json,occurred_at)
    values(v.organisation_id,v_event_id,'EngagementQueuedForSend','Engagement',v.id,jsonb_build_object('campaignId',v.campaign_id,'opportunityId',v.opportunity_id,'draftId',v_draft_id,'queueId',(select id from public.engagement_send_queue where engagement_id=v.id),'scheduledFor',v_scheduled,'recipientTimezone',v_tz.timezone_name),now());
    v_queued:=v_queued+1;
  end loop;
  return query select v_inspected,v_queued,v_held,v_existing;
end $$;

-- Append strategy fields to the review surface. Drop/recreate avoids positional view replacement errors.
drop view if exists public.engagement_review_overview;
create view public.engagement_review_overview with (security_invoker=true) as
select
  e.id,e.organisation_id,e.campaign_id,e.opportunity_id,e.company_id,e.contact_id,e.status,e.outreach_policy,e.reply_policy,
  e.channel_type,e.recipient_name,e.recipient_role,e.recipient_email,e.linkedin_profile_url,e.source_opportunity_score,e.source_opportunity_rank,
  e.engagement_score,e.confidence,e.prepared_at,e.created_at,e.updated_at,
  e.primary_channel,e.secondary_channel,e.fallback_channel,e.entry_strategy,e.recommendation_reason,e.strategy_confidence,e.pipeline_state,e.current_stage,e.stage_reason,e.stage_attempts,e.stage_last_attempt_at,e.stage_next_retry_at,e.stage_failure_reason,
  ca.name campaign_name,co.company_name company_name,o.buying_reason,o.operational_pain,o.recommended_action,o.opportunity_score,o.route_quality,o.route_confidence,o.recommended_entry_strategy,
  d.id draft_id,d.subject,d.opening,d.personalisation,d.buying_angle,d.primary_pain,d.value_proposition,d.supporting_evidence_json,d.call_to_action,d.tone,d.reasoning,d.limitations_json,d.output_json draft_output_json,d.channel_content_json,d.execution_instruction,d.prompt_version,d.schema_version,d.model,d.completed_at draft_completed_at,d.output_json->'routeAlignment' route_alignment_json,
  r.id ai_review_id,r.personalisation_score,r.relevance_score,r.professionalism_score,r.factual_accuracy_score,r.evidence_use_score,r.likelihood_of_response_score,r.engagement_score ai_engagement_score,r.confidence ai_confidence,r.review_notes,r.strengths_json,r.weaknesses_json,r.recommended_changes_json,r.unsupported_claims_json,r.outcome ai_review_outcome,r.completed_at ai_review_completed_at,
  a.output_json->>'commercialObjective' commercial_objective,a.output_json->>'buyingAngle' commercial_buying_angle,a.output_json->>'primaryPain' commercial_primary_pain,a.output_json->>'valueTheme' value_theme,coalesce(a.output_json->'buyerPriorities','[]'::jsonb) buyer_priorities_json,coalesce(a.output_json->'likelyObjections','[]'::jsonb) likely_objections_json,a.output_json->>'recommendedTone' recommended_tone,a.output_json->>'ctaStrategy' cta_strategy,a.output_json->>'reasoning' commercial_reasoning,coalesce(a.output_json->'limitations','[]'::jsonb) commercial_limitations_json,a.output_json->'routeStrategy' route_strategy_json
from public.opportunity_engagements e
join public.campaigns ca on ca.id=e.campaign_id join public.companies co on co.id=e.company_id join public.opportunities o on o.id=e.opportunity_id
left join public.engagement_drafts d on d.engagement_id=e.id and d.status='COMPLETE'
left join public.engagement_draft_reviews r on r.draft_id=d.id and r.status='COMPLETE'
left join public.engagement_commercial_analyses a on a.id=d.commercial_analysis_id;
grant select on public.engagement_review_overview to authenticated;


revoke all on function public.claim_engagement_outreach_generation(uuid) from public,anon,authenticated;
revoke all on function public.complete_engagement_outreach_generation(uuid,jsonb,text,text,integer,text,integer,integer,integer,text) from public,anon,authenticated;
revoke all on function public.run_engagement_queue_builder(uuid) from public,anon,authenticated;
grant execute on function public.claim_engagement_outreach_generation(uuid) to service_role;
grant execute on function public.complete_engagement_outreach_generation(uuid,jsonb,text,text,integer,text,integer,integer,integer,text) to service_role;
grant execute on function public.run_engagement_queue_builder(uuid) to service_role;

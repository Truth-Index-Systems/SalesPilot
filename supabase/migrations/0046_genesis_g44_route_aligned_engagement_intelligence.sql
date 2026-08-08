-- MarketRoute Genesis G4.4: Route-aligned Engagement Intelligence.
-- Commercial reasoning and outreach generation now consume the persisted Best Access Route.
-- Existing approval, queue and dispatch behaviour is unchanged.

-- Fix PL/pgSQL output-variable ambiguity in the G4 commercial reasoning claim RPC.
-- The RETURNS TABLE field engagement_id shadows the table column inside ON CONFLICT.

create or replace function public.claim_engagement_commercial_reasoning(p_scheduler_run_id uuid)
returns table(analysis_id uuid,organisation_id uuid,campaign_id uuid,engagement_id uuid,context_json jsonb)
language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_row public.engagement_commercial_analyses%rowtype;
begin
  if not exists(select 1 from public.pipeline_scheduler_runs where id=p_scheduler_run_id) then raise exception 'scheduler run required'; end if;
  insert into public.engagement_commercial_analyses(organisation_id,campaign_id,engagement_id,opportunity_id)
  select e.organisation_id,e.campaign_id,e.id,e.opportunity_id from public.opportunity_engagements e
  join public.opportunities o on o.id=e.opportunity_id and o.status='APPROVED'
  join public.ai_governance_policies g on g.organisation_id=e.organisation_id and g.autonomy_enabled=true
  where e.status='READY_FOR_DRAFT'
  on conflict on constraint engagement_commercial_analyses_engagement_id_key do nothing;

  select a.id into v_id from public.engagement_commercial_analyses a
  join public.opportunity_engagements e on e.id=a.engagement_id and e.status='READY_FOR_DRAFT'
  where a.attempt_count<5 and (
    (a.status='PENDING' and coalesce(a.next_attempt_at,now())<=now()) or
    (a.status='FAILED_RETRYABLE' and coalesce(a.next_attempt_at,now())<=now()) or
    (a.status='RUNNING' and a.lease_expires_at<now())
  ) order by case a.status when 'PENDING' then 0 when 'FAILED_RETRYABLE' then 1 else 2 end,a.created_at
  for update of a skip locked limit 1;
  if v_id is null then return; end if;
  update public.engagement_commercial_analyses set status='RUNNING',attempt_count=attempt_count+1,scheduler_run_id=p_scheduler_run_id,claimed_at=now(),lease_expires_at=now()+interval '5 minutes',last_error=null,updated_at=now() where id=v_id returning * into v_row;

  return query select v_row.id,v_row.organisation_id,v_row.campaign_id,v_row.engagement_id,
  jsonb_build_object(
    'engagement',jsonb_build_object('id',e.id,'channelType',e.channel_type,'recipientName',e.recipient_name,'recipientRole',e.recipient_role,'sourceOpportunityScore',e.source_opportunity_score),
    'opportunity',jsonb_build_object('id',o.id,'score',o.opportunity_score,'buyingReason',o.buying_reason,'operationalPain',o.operational_pain,'recommendedAction',o.recommended_action,'scoreExplanation',o.score_explanation_json),
    'accessRoute',jsonb_build_object('channelType',e.channel_type,'recipientName',e.recipient_name,'recipientRole',e.recipient_role,'routeQuality',o.route_quality,'routeConfidence',o.route_confidence,'recommendedEntryStrategy',o.recommended_entry_strategy,'routeScore',o.primary_route_score,'routeReason',o.primary_route_reason,'likelyReader',o.primary_route_likely_reader,'contactability',o.contactability,'responseLikelihood',o.likelihood_of_response),
    'campaign',jsonb_build_object('id',ca.id,'name',ca.name,'objective',ca.objective,'audience',cfg.audience,'buyerRoles',cfg.buyer_roles_json,'messageAngle',cfg.message_angle,'why',cfg.why_json),
    'businessDna',jsonb_build_object('profileId',bp.id,'companyName',bp.company_name,'summary',bp.summary,'industry',bp.industry,'payload',bpv.payload_json),
    'company',jsonb_build_object('id',co.id,'name',co.company_name,'websiteUrl',co.website_url,'industry',co.industry,'country',co.country,'summary',co.summary,'confidence',co.confidence),
    'buyer',case when ct.id is null then null else jsonb_build_object('id',ct.id,'fullName',ct.full_name,'roleTitle',ct.role_title,'department',ct.department,'location',ct.location,'reasonSelected',ct.reason_selected,'confidence',ct.overall_confidence,'unknowns',ct.unknowns_json,'riskFlags',ct.risk_flags_json) end,
    'companyEvidence',coalesce((select jsonb_agg(jsonb_build_object('id',ce.id,'claim',ce.claim,'sourceUrl',ce.source_url,'sourceTitle',ce.source_title,'excerpt',ce.excerpt)) from public.company_evidence ce where ce.company_id=co.id),'[]'::jsonb),
    'contactEvidence',coalesce((select jsonb_agg(jsonb_build_object('id',cne.id,'type',cne.evidence_type,'claim',cne.claim,'sourceUrl',cne.source_url,'sourceTitle',cne.source_title,'excerpt',cne.excerpt,'verified',cne.verified,'qualityScore',cne.quality_score)) from public.contact_evidence cne where cne.contact_id=ct.id),'[]'::jsonb)
  )
  from public.engagement_commercial_analyses a
  join public.opportunity_engagements e on e.id=a.engagement_id
  join public.opportunities o on o.id=e.opportunity_id
  join public.campaigns ca on ca.id=e.campaign_id
  join public.campaign_config_versions cfg on cfg.campaign_id=ca.id and cfg.version_number=ca.current_config_version
  join public.business_profiles bp on bp.id=ca.business_profile_id
  left join lateral (select payload_json from public.business_profile_versions v where v.business_profile_id=bp.id order by version_number desc limit 1) bpv on true
  join public.companies co on co.id=e.company_id
  left join public.contacts ct on ct.id=e.contact_id
  where a.id=v_id;
end $$;

revoke all on function public.claim_engagement_commercial_reasoning(uuid) from public,anon,authenticated;
grant execute on function public.claim_engagement_commercial_reasoning(uuid) to service_role;


-- Genesis G4 Phase 4 hotfix: remove PL/pgSQL engagement_id ambiguity

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
  where e.status='READY_FOR_DRAFT'
  on conflict on constraint engagement_drafts_engagement_id_key do nothing;

  select d.id into v_id
  from public.engagement_drafts d
  join public.opportunity_engagements e on e.id=d.engagement_id and e.status='READY_FOR_DRAFT'
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
    'engagement',jsonb_build_object('id',e.id,'channelType',e.channel_type,'recipientName',e.recipient_name,'recipientRole',e.recipient_role,'sourceOpportunityScore',e.source_opportunity_score),
    'commercialAnalysis',a.output_json,
    'opportunity',jsonb_build_object('id',o.id,'score',o.opportunity_score,'buyingReason',o.buying_reason,'operationalPain',o.operational_pain,'recommendedAction',o.recommended_action,'scoreExplanation',o.score_explanation_json),
    'accessRoute',jsonb_build_object('channelType',e.channel_type,'recipientName',e.recipient_name,'recipientRole',e.recipient_role,'routeQuality',o.route_quality,'routeConfidence',o.route_confidence,'recommendedEntryStrategy',o.recommended_entry_strategy,'routeScore',o.primary_route_score,'routeReason',o.primary_route_reason,'likelyReader',o.primary_route_likely_reader,'contactability',o.contactability,'responseLikelihood',o.likelihood_of_response),
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

revoke all on function public.claim_engagement_outreach_generation(uuid) from public,anon,authenticated;
grant execute on function public.claim_engagement_outreach_generation(uuid) to service_role;


create or replace view public.engagement_review_overview with (security_invoker=true) as
select
  e.id,e.organisation_id,e.campaign_id,e.opportunity_id,e.company_id,e.contact_id,e.status,e.outreach_policy,e.reply_policy,
  e.channel_type,e.recipient_name,e.recipient_role,e.recipient_email,e.linkedin_profile_url,e.source_opportunity_score,e.source_opportunity_rank,
  e.engagement_score,e.confidence,e.prepared_at,e.created_at,e.updated_at,
  ca.name campaign_name,co.company_name company_name,o.buying_reason,o.operational_pain,o.recommended_action,o.opportunity_score,
  o.route_quality,o.route_confidence,o.recommended_entry_strategy,
  d.id draft_id,d.subject,d.opening,d.personalisation,d.buying_angle,d.primary_pain,d.value_proposition,d.supporting_evidence_json,
  d.call_to_action,d.tone,d.reasoning,d.limitations_json,d.output_json draft_output_json,d.prompt_version,d.schema_version,d.model,d.completed_at draft_completed_at,
  d.output_json->'routeAlignment' route_alignment_json,
  r.id ai_review_id,r.personalisation_score,r.relevance_score,r.professionalism_score,r.factual_accuracy_score,r.evidence_use_score,
  r.likelihood_of_response_score,r.engagement_score ai_engagement_score,r.confidence ai_confidence,r.review_notes,r.strengths_json,
  r.weaknesses_json,r.recommended_changes_json,r.unsupported_claims_json,r.outcome ai_review_outcome,r.completed_at ai_review_completed_at,
  a.output_json->>'commercialObjective' commercial_objective,a.output_json->>'buyingAngle' commercial_buying_angle,a.output_json->>'primaryPain' commercial_primary_pain,a.output_json->>'valueTheme' value_theme,
  coalesce(a.output_json->'buyerPriorities','[]'::jsonb) buyer_priorities_json,coalesce(a.output_json->'likelyObjections','[]'::jsonb) likely_objections_json,
  a.output_json->>'recommendedTone' recommended_tone,a.output_json->>'ctaStrategy' cta_strategy,a.output_json->>'reasoning' commercial_reasoning,coalesce(a.output_json->'limitations','[]'::jsonb) commercial_limitations_json,
  a.output_json->'routeStrategy' route_strategy_json
from public.opportunity_engagements e
join public.campaigns ca on ca.id=e.campaign_id
join public.companies co on co.id=e.company_id
join public.opportunities o on o.id=e.opportunity_id
left join public.engagement_drafts d on d.engagement_id=e.id and d.status='COMPLETE'
left join public.engagement_draft_reviews r on r.draft_id=d.id and r.status='COMPLETE'
left join public.engagement_commercial_analyses a on a.id=d.commercial_analysis_id;

grant select on public.engagement_review_overview to authenticated;

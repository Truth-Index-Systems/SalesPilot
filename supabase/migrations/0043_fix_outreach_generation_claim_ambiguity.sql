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

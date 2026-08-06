-- SalesPilot Genesis G4 Phase 4: evidence-backed first-outreach generation.
-- Extends the frozen Engagement foundation without sending, scheduling or human review.

alter table public.opportunity_engagements drop constraint if exists opportunity_engagements_status_check;
alter table public.opportunity_engagements add constraint opportunity_engagements_status_check
  check (status in ('NEEDS_ROUTE','READY_FOR_DRAFT','DRAFT_READY','DRAFT_REVIEW','APPROVED_TO_SEND','QUEUED_FOR_SEND','SENT','PAUSED','CANCELLED'));

alter table public.opportunity_engagement_history drop constraint if exists opportunity_engagement_history_event_type_check;
alter table public.opportunity_engagement_history add constraint opportunity_engagement_history_event_type_check check (event_type in (
  'PREPARED','ROUTE_UPDATED','POLICY_UPDATED','STATUS_CHANGED','UPDATED','PAUSED','CANCELLED',
  'COMMERCIAL_ANALYSIS_COMPLETED','COMMERCIAL_ANALYSIS_FAILED',
  'DRAFT_GENERATION_STARTED','DRAFT_CREATED','DRAFT_GENERATION_FAILED',
  'APPROVED_TO_SEND','QUEUED','SENT'
));

create table if not exists public.engagement_drafts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  engagement_id uuid not null references public.opportunity_engagements(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  commercial_analysis_id uuid not null references public.engagement_commercial_analyses(id) on delete cascade,
  status text not null default 'PENDING' check (status in ('PENDING','RUNNING','COMPLETE','FAILED_RETRYABLE','FAILED_FINAL','CANCELLED')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  scheduler_run_id uuid references public.pipeline_scheduler_runs(id) on delete set null,
  subject text,
  opening text,
  personalisation text,
  buying_angle text,
  primary_pain text,
  value_proposition text,
  supporting_evidence_json jsonb not null default '[]'::jsonb,
  call_to_action text,
  tone text,
  reasoning text,
  limitations_json jsonb not null default '[]'::jsonb,
  confidence integer check (confidence between 0 and 100),
  prompt_version text,
  schema_version text,
  model text,
  input_tokens integer,
  output_tokens integer,
  duration_ms integer,
  response_id text,
  output_json jsonb,
  last_error text,
  next_attempt_at timestamptz,
  claimed_at timestamptz,
  lease_expires_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(engagement_id)
);

create index if not exists engagement_drafts_claim_idx on public.engagement_drafts(status,next_attempt_at,created_at)
  where status in ('PENDING','FAILED_RETRYABLE','RUNNING');
create index if not exists engagement_drafts_org_idx on public.engagement_drafts(organisation_id,campaign_id,updated_at desc);
alter table public.engagement_drafts enable row level security;
drop policy if exists engagement_drafts_member_read on public.engagement_drafts;
create policy engagement_drafts_member_read on public.engagement_drafts for select to authenticated
using (public.is_active_org_member(organisation_id));

insert into public.engagement_prompt_versions(version,purpose,system_prompt,template_json,schema_version,model,active)
values(
  'engagement-outreach-generation/v1','FIRST_OUTREACH',
  'Evidence-backed first outreach designed to win a relevant business conversation. No unsupported facts or invented personal information.',
  jsonb_build_object('fields',jsonb_build_array('subject','opening','personalisation','buyingAngle','primaryPain','valueProposition','supportingEvidence','callToAction','tone')),
  'engagement-outreach-generation/v1',null,true
)
on conflict(version) do update set system_prompt=excluded.system_prompt,template_json=excluded.template_json,schema_version=excluded.schema_version;

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
    status='COMPLETE',subject=p_output_json->>'subject',opening=p_output_json->>'opening',personalisation=p_output_json->>'personalisation',
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
    jsonb_build_object('generationType','FIRST_OUTREACH','draftId',v.id,'commercialAnalysisId',v.commercial_analysis_id,'inputTokens',p_input_tokens,'outputTokens',p_output_tokens,'durationMs',p_duration_ms,'responseId',p_response_id));

  insert into public.opportunity_engagement_history(organisation_id,campaign_id,engagement_id,opportunity_id,event_type,previous_status,next_status,metadata_json)
  values(v.organisation_id,v.campaign_id,v.engagement_id,v.opportunity_id,'DRAFT_CREATED','READY_FOR_DRAFT','DRAFT_READY',
    jsonb_build_object('draftId',v.id,'confidence',p_confidence,'promptVersion',p_prompt_version));

  insert into public.campaign_timeline(organisation_id,campaign_id,event_type,title,description,visibility,metadata_json)
  values(v.organisation_id,v.campaign_id,'DRAFT_GENERATED','Personalised outreach prepared',
    'SalesPilot has prepared evidence-backed outreach for this opportunity.','CUSTOMER',
    jsonb_build_object('engagementId',v.engagement_id,'opportunityId',v.opportunity_id,'draftId',v.id,'confidence',p_confidence));

  v_event_id:=gen_random_uuid();
  insert into public.domain_outbox(organisation_id,event_id,event_type,aggregate_type,aggregate_id,payload_json,occurred_at)
  values(v.organisation_id,v_event_id,'EngagementDraftGenerated','OpportunityEngagement',v.engagement_id,
    jsonb_build_object('campaignId',v.campaign_id,'opportunityId',v.opportunity_id,'draftId',v.id,'status','DRAFT_READY','promptVersion',p_prompt_version,'confidence',p_confidence),now());
end $$;

create or replace function public.fail_engagement_outreach_generation(p_draft_id uuid,p_error text)
returns void language plpgsql security definer set search_path=public as $$
declare v public.engagement_drafts%rowtype; v_final boolean;
begin
  select * into v from public.engagement_drafts where id=p_draft_id for update;
  if v.id is null then return; end if;
  v_final:=v.attempt_count>=5;
  update public.engagement_drafts set status=case when v_final then 'FAILED_FINAL' else 'FAILED_RETRYABLE' end,
    last_error=left(p_error,1000),next_attempt_at=case when v_final then null else now()+make_interval(mins=>least(60,power(2,greatest(v.attempt_count,1))::integer)) end,
    lease_expires_at=null,updated_at=now() where id=v.id;
  insert into public.opportunity_engagement_history(organisation_id,campaign_id,engagement_id,opportunity_id,event_type,previous_status,next_status,metadata_json)
  select v.organisation_id,v.campaign_id,v.engagement_id,v.opportunity_id,'DRAFT_GENERATION_FAILED',e.status,e.status,
    jsonb_build_object('draftId',v.id,'attempt',v.attempt_count,'final',v_final,'error',left(p_error,500))
  from public.opportunity_engagements e where e.id=v.engagement_id;
end $$;

revoke all on function public.claim_engagement_outreach_generation(uuid) from public,anon,authenticated;
revoke all on function public.complete_engagement_outreach_generation(uuid,jsonb,text,text,integer,text,integer,integer,integer,text) from public,anon,authenticated;
revoke all on function public.fail_engagement_outreach_generation(uuid,text) from public,anon,authenticated;
grant execute on function public.claim_engagement_outreach_generation(uuid) to service_role;
grant execute on function public.complete_engagement_outreach_generation(uuid,jsonb,text,text,integer,text,integer,integer,integer,text) to service_role;
grant execute on function public.fail_engagement_outreach_generation(uuid,text) to service_role;

-- MarketRoute Genesis G4 Phase 3: Commercial Reasoning Engine.
-- Adds evidence-bound, structured opportunity understanding before drafting.
-- No outreach copy, sending, scheduling or G3.5 redesign is introduced.

alter table public.ai_usage_ledger drop constraint if exists ai_usage_ledger_job_type_check;
alter table public.ai_usage_ledger add constraint ai_usage_ledger_job_type_check
  check (job_type in ('BUSINESS_ANALYSIS','COMPANY_DISCOVERY','CONTACT_DISCOVERY','OUTREACH','COMMERCIAL_REASONING','REPLY_INTELLIGENCE'));

create table if not exists public.engagement_commercial_analyses (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  engagement_id uuid not null references public.opportunity_engagements(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  status text not null default 'PENDING' check (status in ('PENDING','RUNNING','COMPLETE','FAILED_RETRYABLE','FAILED_FINAL','CANCELLED')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  scheduler_run_id uuid references public.pipeline_scheduler_runs(id) on delete set null,
  prompt_version text,
  schema_version text,
  model text,
  output_json jsonb,
  confidence integer check (confidence between 0 and 100),
  last_error text,
  next_attempt_at timestamptz,
  claimed_at timestamptz,
  lease_expires_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(engagement_id)
);
create index if not exists engagement_commercial_analyses_claim_idx on public.engagement_commercial_analyses(status,next_attempt_at,created_at)
  where status in ('PENDING','FAILED_RETRYABLE','RUNNING');
create index if not exists engagement_commercial_analyses_org_idx on public.engagement_commercial_analyses(organisation_id,campaign_id,updated_at desc);
alter table public.engagement_commercial_analyses enable row level security;
drop policy if exists engagement_commercial_analyses_member_read on public.engagement_commercial_analyses;
create policy engagement_commercial_analyses_member_read on public.engagement_commercial_analyses for select to authenticated
using (public.is_active_org_member(organisation_id));

insert into public.engagement_prompt_versions(version,purpose,system_prompt,template_json,schema_version,model,active)
values(
  'engagement-commercial-reasoning/v1','COMMERCIAL_REASONING',
  'Evidence-bound commercial reasoning before outreach. No unsupported facts or personal information.',
  jsonb_build_object('stages',jsonb_build_array('commercialObjective','buyingAngle','buyerPriorities','objections','ctaStrategy')),
  'engagement-commercial-reasoning/v1',null,true
)
on conflict(version) do update set system_prompt=excluded.system_prompt,template_json=excluded.template_json,schema_version=excluded.schema_version;

alter table public.opportunity_engagement_history drop constraint if exists opportunity_engagement_history_event_type_check;
alter table public.opportunity_engagement_history add constraint opportunity_engagement_history_event_type_check check (event_type in (
  'PREPARED','ROUTE_UPDATED','POLICY_UPDATED','STATUS_CHANGED','UPDATED','PAUSED','CANCELLED',
  'COMMERCIAL_ANALYSIS_COMPLETED','COMMERCIAL_ANALYSIS_FAILED','DRAFT_CREATED','APPROVED_TO_SEND','QUEUED','SENT'
));

-- Extend governance reservation with the new bounded job type.
create or replace function public.reserve_ai_request(
  p_organisation_id uuid,p_campaign_id uuid,p_scheduler_run_id uuid,p_job_type text,p_job_id uuid,
  p_request_key text,p_model text,p_estimated_cost_usd numeric
) returns table(allowed boolean, ledger_id uuid, reason_code text, requests_today integer, cost_today numeric, request_limit integer, cost_limit numeric)
language plpgsql security definer set search_path=public as $$
declare v_policy public.ai_governance_policies%rowtype; v_requests integer:=0; v_campaign_requests integer:=0; v_cost numeric:=0; v_ledger uuid;
begin
  if p_job_type not in ('BUSINESS_ANALYSIS','COMPANY_DISCOVERY','CONTACT_DISCOVERY','OUTREACH','COMMERCIAL_REASONING','REPLY_INTELLIGENCE') then raise exception 'invalid AI job type'; end if;
  if p_organisation_id is null then return query select false,null::uuid,'ORGANISATION_REQUIRED',0,0::numeric,0,0::numeric; return; end if;
  select * into v_policy from public.ensure_ai_governance_policy(p_organisation_id);
  select count(*),coalesce(sum(case when status='SUCCEEDED' then actual_cost_usd else estimated_cost_usd end),0) into v_requests,v_cost
  from public.ai_usage_ledger where organisation_id=p_organisation_id and created_at>=date_trunc('day',now()) and status in ('RESERVED','SUCCEEDED','FAILED');
  if p_campaign_id is not null then select count(*) into v_campaign_requests from public.ai_usage_ledger where campaign_id=p_campaign_id and created_at>=date_trunc('day',now()) and status in ('RESERVED','SUCCEEDED','FAILED'); end if;
  if not v_policy.autonomy_enabled then
    insert into public.ai_usage_ledger(organisation_id,campaign_id,scheduler_run_id,job_type,job_id,request_key,model,status,estimated_cost_usd,error_code)
    values(p_organisation_id,p_campaign_id,p_scheduler_run_id,p_job_type,p_job_id,p_request_key,p_model,'BLOCKED',greatest(p_estimated_cost_usd,0),'AUTONOMY_DISABLED') on conflict(request_key) do nothing returning id into v_ledger;
    return query select false,v_ledger,'AUTONOMY_DISABLED',v_requests,v_cost,v_policy.daily_request_limit,v_policy.daily_cost_limit_usd; return;
  end if;
  if v_requests>=v_policy.daily_request_limit then
    insert into public.ai_usage_ledger(organisation_id,campaign_id,scheduler_run_id,job_type,job_id,request_key,model,status,estimated_cost_usd,error_code)
    values(p_organisation_id,p_campaign_id,p_scheduler_run_id,p_job_type,p_job_id,p_request_key,p_model,'BLOCKED',greatest(p_estimated_cost_usd,0),'WORKSPACE_DAILY_REQUEST_LIMIT') on conflict(request_key) do nothing returning id into v_ledger;
    return query select false,v_ledger,'WORKSPACE_DAILY_REQUEST_LIMIT',v_requests,v_cost,v_policy.daily_request_limit,v_policy.daily_cost_limit_usd; return;
  end if;
  if p_campaign_id is not null and v_campaign_requests>=v_policy.campaign_daily_request_limit then
    insert into public.ai_usage_ledger(organisation_id,campaign_id,scheduler_run_id,job_type,job_id,request_key,model,status,estimated_cost_usd,error_code)
    values(p_organisation_id,p_campaign_id,p_scheduler_run_id,p_job_type,p_job_id,p_request_key,p_model,'BLOCKED',greatest(p_estimated_cost_usd,0),'CAMPAIGN_DAILY_REQUEST_LIMIT') on conflict(request_key) do nothing returning id into v_ledger;
    return query select false,v_ledger,'CAMPAIGN_DAILY_REQUEST_LIMIT',v_requests,v_cost,v_policy.daily_request_limit,v_policy.daily_cost_limit_usd; return;
  end if;
  if v_cost+greatest(p_estimated_cost_usd,0)>v_policy.daily_cost_limit_usd then
    insert into public.ai_usage_ledger(organisation_id,campaign_id,scheduler_run_id,job_type,job_id,request_key,model,status,estimated_cost_usd,error_code)
    values(p_organisation_id,p_campaign_id,p_scheduler_run_id,p_job_type,p_job_id,p_request_key,p_model,'BLOCKED',greatest(p_estimated_cost_usd,0),'WORKSPACE_DAILY_COST_LIMIT') on conflict(request_key) do nothing returning id into v_ledger;
    return query select false,v_ledger,'WORKSPACE_DAILY_COST_LIMIT',v_requests,v_cost,v_policy.daily_request_limit,v_policy.daily_cost_limit_usd; return;
  end if;
  insert into public.ai_usage_ledger(organisation_id,campaign_id,scheduler_run_id,job_type,job_id,request_key,model,status,estimated_cost_usd)
  values(p_organisation_id,p_campaign_id,p_scheduler_run_id,p_job_type,p_job_id,p_request_key,p_model,'RESERVED',greatest(p_estimated_cost_usd,0))
  on conflict(request_key) do update set request_key=excluded.request_key returning id into v_ledger;
  return query select true,v_ledger,null::text,v_requests+1,v_cost+greatest(p_estimated_cost_usd,0),v_policy.daily_request_limit,v_policy.daily_cost_limit_usd;
end $$;

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

create or replace function public.complete_engagement_commercial_reasoning(p_analysis_id uuid,p_output_json jsonb,p_prompt_version text,p_schema_version text,p_confidence integer,p_model text)
returns void language plpgsql security definer set search_path=public as $$
declare v public.engagement_commercial_analyses%rowtype;
begin
  select * into v from public.engagement_commercial_analyses where id=p_analysis_id for update;
  if v.id is null then raise exception 'commercial analysis missing'; end if;
  if v.status='COMPLETE' then return; end if;
  if v.status<>'RUNNING' then raise exception 'commercial analysis not running'; end if;
  update public.engagement_commercial_analyses set status='COMPLETE',output_json=p_output_json,prompt_version=p_prompt_version,schema_version=p_schema_version,model=p_model,confidence=least(100,greatest(0,p_confidence)),completed_at=now(),lease_expires_at=null,updated_at=now() where id=v.id;
  update public.opportunity_engagements set generation_version=p_schema_version,prompt_version=p_prompt_version,confidence=least(100,greatest(0,p_confidence)),updated_at=now() where id=v.engagement_id;
  insert into public.engagement_generation_history(organisation_id,campaign_id,engagement_id,opportunity_id,generation_version,prompt_version,model,output_json,confidence,metadata_json)
  values(v.organisation_id,v.campaign_id,v.engagement_id,v.opportunity_id,p_schema_version,p_prompt_version,p_model,p_output_json,p_confidence,jsonb_build_object('generationType','COMMERCIAL_REASONING','analysisId',v.id));
  insert into public.opportunity_engagement_history(organisation_id,campaign_id,engagement_id,opportunity_id,event_type,previous_status,next_status,metadata_json)
  select v.organisation_id,v.campaign_id,v.engagement_id,v.opportunity_id,'COMMERCIAL_ANALYSIS_COMPLETED',e.status,e.status,jsonb_build_object('analysisId',v.id,'confidence',p_confidence,'promptVersion',p_prompt_version) from public.opportunity_engagements e where e.id=v.engagement_id;
  insert into public.campaign_timeline(organisation_id,campaign_id,event_type,title,description,visibility,metadata_json)
  values(v.organisation_id,v.campaign_id,'COMMERCIAL_ANALYSIS_COMPLETE','Opportunity understood','MarketRoute has established an evidence-backed commercial approach for this opportunity.','CUSTOMER',jsonb_build_object('engagementId',v.engagement_id,'opportunityId',v.opportunity_id,'confidence',p_confidence));
end $$;

create or replace function public.fail_engagement_commercial_reasoning(p_analysis_id uuid,p_error text)
returns void language plpgsql security definer set search_path=public as $$
declare v public.engagement_commercial_analyses%rowtype; v_final boolean;
begin
  select * into v from public.engagement_commercial_analyses where id=p_analysis_id for update; if v.id is null then return; end if;
  v_final:=v.attempt_count>=5;
  update public.engagement_commercial_analyses set status=case when v_final then 'FAILED_FINAL' else 'FAILED_RETRYABLE' end,last_error=left(p_error,1000),next_attempt_at=case when v_final then null else now()+make_interval(mins=>least(60,power(2,greatest(v.attempt_count,1))::integer)) end,lease_expires_at=null,updated_at=now() where id=v.id;
end $$;

revoke all on function public.claim_engagement_commercial_reasoning(uuid) from public,anon,authenticated;
revoke all on function public.complete_engagement_commercial_reasoning(uuid,jsonb,text,text,integer,text) from public,anon,authenticated;
revoke all on function public.fail_engagement_commercial_reasoning(uuid,text) from public,anon,authenticated;
grant execute on function public.claim_engagement_commercial_reasoning(uuid) to service_role;
grant execute on function public.complete_engagement_commercial_reasoning(uuid,jsonb,text,text,integer,text) to service_role;
grant execute on function public.fail_engagement_commercial_reasoning(uuid,text) to service_role;

-- MarketRoute Genesis SQL hardening pass.
-- Replaces live RPCs that are vulnerable to PL/pgSQL output-variable/column ambiguity.

create or replace function public.claim_business_analysis_job(
  p_job_id uuid,
  p_access_token_hash text,
  p_lease_seconds integer default 240
) returns public.business_analysis_jobs
language plpgsql security definer set search_path=public as $$
declare v_job public.business_analysis_jobs%rowtype;
begin
  update public.business_analysis_jobs as baj
  set
    status='RUNNING',
    stage='READING_WEBSITE',
    progress=8,
    attempt_count=baj.attempt_count+1,
    claimed_at=now(),
    lease_expires_at=now()+make_interval(secs => greatest(60,least(p_lease_seconds,600))),
    next_retry_at=null,
    last_error_code=null,
    last_error_message=null,
    started_at=coalesce(baj.started_at,now()),
    updated_at=now()
  where baj.id=p_job_id
    and baj.access_token_hash=p_access_token_hash
    and (
      baj.status='QUEUED'
      or (baj.status='FAILED_RETRYABLE' and coalesce(baj.next_retry_at,now())<=now())
      or (baj.status='RUNNING' and baj.lease_expires_at<now())
    )
  returning * into v_job;
  return v_job;
end $$;

create or replace function public.update_business_analysis_progress(
  p_job_id uuid,
  p_access_token_hash text,
  p_stage text,
  p_progress integer,
  p_canonical_url text default null,
  p_pages_read integer default null
) returns boolean
language plpgsql security definer set search_path=public as $$
begin
  update public.business_analysis_jobs as baj set
    stage=p_stage,
    progress=greatest(0,least(p_progress,99)),
    canonical_url=coalesce(p_canonical_url,baj.canonical_url),
    pages_read=coalesce(p_pages_read,baj.pages_read),
    lease_expires_at=now()+interval '4 minutes',
    updated_at=now()
  where baj.id=p_job_id and baj.access_token_hash=p_access_token_hash and baj.status='RUNNING';
  return found;
end $$;

create or replace function public.complete_business_analysis_job(
  p_job_id uuid,
  p_access_token_hash text,
  p_canonical_url text,
  p_pages_read integer,
  p_analysis jsonb,
  p_result_summary jsonb default '{}'::jsonb
) returns boolean
language plpgsql security definer set search_path=public as $$
begin
  update public.business_analysis_jobs as baj set
    status='COMPLETED', stage='COMPLETE', progress=100,
    canonical_url=p_canonical_url, pages_read=p_pages_read,
    analysis_json=p_analysis,
    result_summary_json=coalesce(p_result_summary,'{}'::jsonb),
    claimed_at=null, lease_expires_at=null, next_retry_at=null,
    completed_at=now(), updated_at=now()
  where baj.id=p_job_id and baj.access_token_hash=p_access_token_hash and baj.status='RUNNING';
  return found;
end $$;

create or replace function public.fail_business_analysis_job(
  p_job_id uuid,
  p_access_token_hash text,
  p_error_code text,
  p_error_message text,
  p_retryable boolean
) returns boolean
language plpgsql security definer set search_path=public as $$
declare v_attempt integer;
begin
  select baj.attempt_count into v_attempt from public.business_analysis_jobs baj
  where baj.id=p_job_id and baj.access_token_hash=p_access_token_hash for update;
  if not found then return false; end if;
  update public.business_analysis_jobs as baj set
    status=case when p_retryable and v_attempt<5 then 'FAILED_RETRYABLE' else 'FAILED_TERMINAL' end,
    stage='FAILED', progress=0,
    last_error_code=p_error_code,
    last_error_message=left(p_error_message,1000),
    next_retry_at=case
      when not p_retryable or v_attempt>=5 then null
      when v_attempt<=1 then now()+interval '1 minute'
      when v_attempt=2 then now()+interval '5 minutes'
      when v_attempt=3 then now()+interval '30 minutes'
      else now()+interval '2 hours'
    end,
    claimed_at=null, lease_expires_at=null, updated_at=now()
  where baj.id=p_job_id and baj.access_token_hash=p_access_token_hash;
  return true;
end $$;

create or replace function public.plan_contact_discovery_dispatch(
  p_scheduler_run_id uuid,
  p_estimated_cost_usd numeric default 0.35
) returns table(dispatch_count integer,campaign_id uuid,mode text)
language plpgsql security definer set search_path=public as $$
declare
  v_campaign_id uuid;
  v_org_id uuid;
  v_policy public.ai_governance_policies%rowtype;
  v_queued integer:=0;
  v_requests integer:=0;
  v_campaign_requests integer:=0;
  v_cost numeric:=0;
  v_request_slots integer:=0;
  v_campaign_slots integer:=0;
  v_cost_slots integer:=0;
  v_dispatch integer:=1;
begin
  -- A burst is only for fresh queued jobs, with no running contact work and no due retry.
  select ca.id,ca.organisation_id
    into v_campaign_id,v_org_id
  from public.campaigns ca
  join public.ai_governance_policies g on g.organisation_id=ca.organisation_id and g.autonomy_enabled=true
  where ca.status not in ('PAUSED','CANCELLED')
    and ca.initial_contact_burst_completed_at is null
    and exists (
      select 1 from public.contact_discovery_sessions s
      where s.campaign_id=ca.id and s.status='QUEUED' and coalesce(s.job_state,'QUEUED')='QUEUED'
        and s.attempt_count=0 and coalesce(s.next_attempt_at,s.next_retry_at,now())<=now()
    )
    and not exists (
      select 1 from public.contact_discovery_sessions s
      where s.campaign_id=ca.id and (s.status='RUNNING' or coalesce(s.job_state,'')='RUNNING')
    )
    and not exists (
      select 1 from public.contact_discovery_sessions s
      where s.campaign_id=ca.id and s.status='FAILED' and coalesce(s.job_state,'')='FAILED_RETRYABLE'
        and coalesce(s.next_retry_at,s.next_attempt_at,now())<=now()
    )
  order by ca.created_at
  for update of ca skip locked
  limit 1;

  if v_campaign_id is null then
    return query select 1,null::uuid,'NORMAL'::text;
    return;
  end if;

  select * into v_policy from public.ensure_ai_governance_policy(v_org_id);
  select count(*) into v_queued from public.contact_discovery_sessions s
    where s.campaign_id=v_campaign_id and s.status='QUEUED' and coalesce(s.job_state,'QUEUED')='QUEUED'
      and s.attempt_count=0 and coalesce(s.next_attempt_at,s.next_retry_at,now())<=now();

  select count(*),coalesce(sum(case when l.status='SUCCEEDED' then l.actual_cost_usd else l.estimated_cost_usd end),0)
    into v_requests,v_cost
  from public.ai_usage_ledger l
  where l.organisation_id=v_org_id and l.created_at>=date_trunc('day',now())
    and l.status in ('RESERVED','SUCCEEDED','FAILED');

  select count(*) into v_campaign_requests from public.ai_usage_ledger l
  where l.campaign_id=v_campaign_id and l.created_at>=date_trunc('day',now())
    and l.status in ('RESERVED','SUCCEEDED','FAILED');

  v_request_slots:=greatest(v_policy.daily_request_limit-v_requests,0);
  v_campaign_slots:=greatest(v_policy.campaign_daily_request_limit-v_campaign_requests,0);
  if greatest(p_estimated_cost_usd,0)>0 then
    v_cost_slots:=greatest(floor((v_policy.daily_cost_limit_usd-v_cost)/greatest(p_estimated_cost_usd,0))::integer,0);
  else
    v_cost_slots:=v_policy.initial_contact_burst_size;
  end if;

  v_dispatch:=least(v_policy.initial_contact_burst_size,v_queued,v_request_slots,v_campaign_slots,v_cost_slots);

  -- No allowance means no claim and no consumed burst. The scheduler may retry
  -- after the daily governance window resets or an administrator raises limits.
  if v_dispatch<=0 then
    return query select 0,v_campaign_id,'BUDGET_BLOCKED'::text;
    return;
  end if;

  update public.campaigns set
    initial_contact_burst_completed_at=now(),
    initial_contact_burst_size=v_dispatch,
    updated_at=now()
  where id=v_campaign_id;

  return query select v_dispatch,v_campaign_id,case when v_dispatch>1 then 'INITIAL_BURST' else 'BUDGET_FALLBACK' end;
end $$;

create or replace function public.claim_engagement_self_review(p_scheduler_run_id uuid)
returns table(review_id uuid,draft_id uuid,organisation_id uuid,campaign_id uuid,engagement_id uuid,context_json jsonb)
language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_row public.engagement_draft_reviews%rowtype;
begin
  if not exists(select 1 from public.pipeline_scheduler_runs where id=p_scheduler_run_id) then raise exception 'scheduler run required'; end if;

  insert into public.engagement_draft_reviews(organisation_id,campaign_id,engagement_id,opportunity_id,draft_id)
  select d.organisation_id,d.campaign_id,d.engagement_id,d.opportunity_id,d.id
  from public.engagement_drafts d
  join public.opportunity_engagements e on e.id=d.engagement_id and e.status='DRAFT_READY'
  join public.ai_governance_policies g on g.organisation_id=d.organisation_id and g.autonomy_enabled=true
  where d.status='COMPLETE'
  on conflict on constraint engagement_draft_reviews_draft_id_key do nothing;

  select r.id into v_id
  from public.engagement_draft_reviews r
  join public.engagement_drafts d on d.id=r.draft_id and d.status='COMPLETE'
  join public.opportunity_engagements e on e.id=r.engagement_id and e.status='DRAFT_READY'
  where r.attempt_count<5 and (
    (r.status='PENDING' and coalesce(r.next_attempt_at,now())<=now()) or
    (r.status='FAILED_RETRYABLE' and coalesce(r.next_attempt_at,now())<=now()) or
    (r.status='RUNNING' and r.lease_expires_at<now())
  )
  order by case r.status when 'PENDING' then 0 when 'FAILED_RETRYABLE' then 1 else 2 end,r.created_at
  for update of r skip locked limit 1;
  if v_id is null then return; end if;

  update public.engagement_draft_reviews
  set status='RUNNING',attempt_count=attempt_count+1,scheduler_run_id=p_scheduler_run_id,
      claimed_at=now(),lease_expires_at=now()+interval '5 minutes',last_error=null,updated_at=now()
  where id=v_id returning * into v_row;

  insert into public.opportunity_engagement_history(organisation_id,campaign_id,engagement_id,opportunity_id,event_type,previous_status,next_status,metadata_json)
  values(v_row.organisation_id,v_row.campaign_id,v_row.engagement_id,v_row.opportunity_id,'SELF_REVIEW_STARTED','DRAFT_READY','DRAFT_READY',
    jsonb_build_object('reviewId',v_row.id,'draftId',v_row.draft_id,'schedulerRunId',p_scheduler_run_id,'attempt',v_row.attempt_count));

  return query
  select v_row.id,v_row.draft_id,v_row.organisation_id,v_row.campaign_id,v_row.engagement_id,
    jsonb_build_object(
      'draft',d.output_json,
      'commercialAnalysis',a.output_json,
      'opportunity',jsonb_build_object('id',o.id,'score',o.opportunity_score,'buyingReason',o.buying_reason,'operationalPain',o.operational_pain,'recommendedAction',o.recommended_action,'scoreExplanation',o.score_explanation_json),
      'companyEvidence',coalesce((select jsonb_agg(jsonb_build_object('id',ce.id,'claim',ce.claim,'sourceUrl',ce.source_url,'sourceTitle',ce.source_title,'excerpt',ce.excerpt)) from public.company_evidence ce where ce.company_id=e.company_id),'[]'::jsonb),
      'contactEvidence',coalesce((select jsonb_agg(jsonb_build_object('id',cne.id,'type',cne.evidence_type,'claim',cne.claim,'sourceUrl',cne.source_url,'sourceTitle',cne.source_title,'excerpt',cne.excerpt,'verified',cne.verified,'qualityScore',cne.quality_score)) from public.contact_evidence cne where cne.contact_id=e.contact_id),'[]'::jsonb)
    )
  from public.engagement_draft_reviews r
  join public.engagement_drafts d on d.id=r.draft_id
  join public.engagement_commercial_analyses a on a.id=d.commercial_analysis_id
  join public.opportunity_engagements e on e.id=r.engagement_id
  join public.opportunities o on o.id=r.opportunity_id
  where r.id=v_id;
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
    where e.status='APPROVED_TO_SEND'
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
    v_address:=case when v.channel_type='EMAIL' then nullif(trim(coalesce(v.recipient_email,'')),'') when v.channel_type='LINKEDIN' then nullif(trim(coalesce(v.linkedin_profile_url,'')),'') else null end;
    if v.channel_type not in ('EMAIL','LINKEDIN') then
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


revoke all on function public.claim_business_analysis_job(uuid,text,integer) from public,anon,authenticated;
revoke all on function public.update_business_analysis_progress(uuid,text,text,integer,text,integer) from public,anon,authenticated;
revoke all on function public.complete_business_analysis_job(uuid,text,text,integer,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.fail_business_analysis_job(uuid,text,text,text,boolean) from public,anon,authenticated;
revoke all on function public.plan_contact_discovery_dispatch(uuid,numeric) from public,anon,authenticated;
revoke all on function public.claim_engagement_self_review(uuid) from public,anon,authenticated;
revoke all on function public.run_engagement_queue_builder(uuid) from public,anon,authenticated;
grant execute on function public.claim_business_analysis_job(uuid,text,integer) to service_role;
grant execute on function public.update_business_analysis_progress(uuid,text,text,integer,text,integer) to service_role;
grant execute on function public.complete_business_analysis_job(uuid,text,text,integer,jsonb,jsonb) to service_role;
grant execute on function public.fail_business_analysis_job(uuid,text,text,text,boolean) to service_role;
grant execute on function public.plan_contact_discovery_dispatch(uuid,numeric) to service_role;
grant execute on function public.claim_engagement_self_review(uuid) to service_role;
grant execute on function public.run_engagement_queue_builder(uuid) to service_role;

-- Genesis G4.7.11: stage authority + presentation hardening.
-- Final removal of duplicate G3 hand-off logic from the current G4 scheduler path.

-- 1) Company Discovery technical retry policy must match the canonical 5-attempt
-- claim/recovery contract. The older G4 function terminalised after attempt 3.
create or replace function public.record_company_discovery_failure_v2(
  p_session_id uuid,
  p_error_code text,
  p_error_message text,
  p_retryable boolean,
  p_failure_phase text
) returns void language plpgsql security definer set search_path=public as $$
declare
  v_attempt integer;
  v_delay interval;
  v_phase text:=upper(coalesce(nullif(trim(p_failure_phase),''),'PREPARING'));
begin
  select attempt_count into v_attempt from public.discovery_sessions where id=p_session_id for update;
  if not found then raise exception 'discovery session missing'; end if;
  v_delay:=case when p_retryable then public.pipeline_retry_delay(v_attempt,p_error_code) else null end;

  update public.discovery_sessions set
    status='FAILED',
    job_state=case when v_delay is null then 'FAILED_TERMINAL' else 'FAILED_RETRYABLE' end,
    stage=case when v_delay is null then 'NEEDS_ATTENTION' else 'TECHNICAL_RETRY' end,
    progress=case when v_phase in ('PREPARING','PLANNING') then 15 else greatest(coalesce(progress,0),25) end,
    last_error=left(p_error_code,1000),
    last_error_code=left(p_error_code,100),
    last_error_message=left(p_error_message,1000),
    result_summary_json=coalesce(result_summary_json,'{}'::jsonb)||jsonb_build_object(
      'technicalFailure',true,'failurePhase',v_phase,'expansionPending',false
    ),
    next_retry_at=case when v_delay is null then null else now()+v_delay end,
    next_attempt_at=case when v_delay is null then null else now()+v_delay end,
    claimed_at=null,scheduler_run_id=null,lease_expires_at=null,
    heartbeat_at=now(),last_heartbeat_at=now(),updated_at=now()
  where id=p_session_id;
end $$;

-- Repair rows terminalised by the old 3-attempt policy when the canonical
-- five-attempt budget has not actually been consumed.
update public.discovery_sessions
set status='FAILED',job_state='FAILED_RETRYABLE',stage='TECHNICAL_RETRY',
    next_retry_at=coalesce(next_retry_at,now()+public.pipeline_retry_delay(attempt_count,coalesce(last_error_code,'UNKNOWN'))),
    next_attempt_at=coalesce(next_attempt_at,now()+public.pipeline_retry_delay(attempt_count,coalesce(last_error_code,'UNKNOWN'))),
    updated_at=now()
where job_state='FAILED_TERMINAL'
  and coalesce(attempt_count,0)<5
  and coalesce(result_summary_json->>'technicalFailure','false')='true';

-- 2) Recovery terminal rows must say NEEDS_ATTENTION, not TECHNICAL_RETRY.
create or replace function public.recover_pipeline_jobs(p_run_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare v_count integer:=0; v_changed integer:=0;
begin
 perform public.assert_active_pipeline_scheduler_run(p_run_id);
 update public.discovery_sessions set
   status='FAILED',
   job_state=case when attempt_count>=5 then 'FAILED_TERMINAL' else 'FAILED_RETRYABLE' end,
   stage=case when attempt_count>=5 then 'NEEDS_ATTENTION' else 'TECHNICAL_RETRY' end,
   last_error='WORKER_LEASE_EXPIRED',last_error_code='WORKER_LEASE_EXPIRED',
   last_error_message='The worker lease expired before completion.',
   next_retry_at=case when attempt_count>=5 then null else now()+public.pipeline_retry_delay(attempt_count,'WORKER_LEASE_EXPIRED') end,
   next_attempt_at=case when attempt_count>=5 then null else now()+public.pipeline_retry_delay(attempt_count,'WORKER_LEASE_EXPIRED') end,
   claimed_at=null,scheduler_run_id=null,lease_expires_at=null,last_heartbeat_at=now(),heartbeat_at=now(),updated_at=now()
 where status='RUNNING' and (lease_expires_at is null or lease_expires_at<=now());
 get diagnostics v_changed=row_count; v_count:=v_count+v_changed;
 update public.contact_discovery_sessions set
   status='FAILED',job_state=case when attempt_count>=8 then 'FAILED_TERMINAL' else 'FAILED_RETRYABLE' end,
   result_status='FAILED',stage='PREPARING',last_error='WORKER_LEASE_EXPIRED',last_error_code='WORKER_LEASE_EXPIRED',
   last_error_message='The worker lease expired before completion.',
   next_retry_at=case when attempt_count>=8 then null else now()+public.pipeline_retry_delay(attempt_count,'WORKER_LEASE_EXPIRED') end,
   next_attempt_at=case when attempt_count>=8 then null else now()+public.pipeline_retry_delay(attempt_count,'WORKER_LEASE_EXPIRED') end,
   claimed_at=null,scheduler_run_id=null,lease_expires_at=null,last_heartbeat_at=now(),heartbeat_at=now(),updated_at=now()
 where status='RUNNING' and (lease_expires_at is null or lease_expires_at<=now());
 get diagnostics v_changed=row_count; v_count:=v_count+v_changed;
 update public.pipeline_scheduler_runs set recovered_jobs=v_count where id=p_run_id;
 return v_count;
end $$;

-- 3) prepare_pipeline_work owns Company Discovery preparation/replenishment only.
-- Route Intelligence foundation creation/cancellation belongs exclusively to
-- sync_contact_discovery_foundations(). Opportunity/Engagement own later hand-offs.
create or replace function public.prepare_pipeline_work(p_run_id uuid)
returns table(
  "campaignsInspected" integer,
  "companyJobsCreated" integer,
  "companyTopUpsQueued" integer,
  "contactJobsCreated" integer,
  "expiredCompanyLeasesRecovered" integer,
  "expiredContactLeasesRecovered" integer
)
language plpgsql security definer set search_path=public as $$
declare
  v_campaign public.campaigns%rowtype;
  v_session public.discovery_sessions%rowtype;
  v_campaigns integer:=0;
  v_company_created integer:=0;
  v_company_topups integer:=0;
  v_pending_companies integer:=0;
  v_total_companies integer:=0;
  v_next_cycle integer:=1;
  v_event_id uuid;
  v_preparation jsonb;
begin
  perform public.assert_active_pipeline_scheduler_run(p_run_id);

  for v_campaign in
    select c.* from public.campaigns c
    where c.status in ('PREPARING','READY')
    order by c.created_at
    for update skip locked
  loop
    v_campaigns:=v_campaigns+1;
    select count(*) filter(where review_status='PENDING_REVIEW'),count(*)
      into v_pending_companies,v_total_companies
    from public.companies
    where organisation_id=v_campaign.organisation_id and campaign_id=v_campaign.id;

    select * into v_session from public.discovery_sessions
    where organisation_id=v_campaign.organisation_id and campaign_id=v_campaign.id
    for update;

    if v_session.id is null then
      insert into public.discovery_sessions(
        organisation_id,campaign_id,status,job_state,stage,progress,next_attempt_at,
        cycle_number,cycle_started_at,queue_floor,cycle_baseline_company_count,
        last_cycle_new_companies,consecutive_empty_cycles,top_up_not_before
      ) values(
        v_campaign.organisation_id,v_campaign.id,'QUEUED','QUEUED','PREPARING',0,now(),
        1,now(),6,v_total_companies,0,0,null
      ) returning * into v_session;
      v_company_created:=v_company_created+1;
      if not exists(select 1 from public.campaign_timeline where organisation_id=v_campaign.organisation_id and campaign_id=v_campaign.id and event_type='COMPANY_DISCOVERY_QUEUED') then
        insert into public.campaign_timeline(organisation_id,campaign_id,event_type,title,description,visibility,metadata_json)
        values(v_campaign.organisation_id,v_campaign.id,'COMPANY_DISCOVERY_QUEUED','Company discovery queued','SalesPilot is preparing to find companies that match the approved campaign.','CUSTOMER',jsonb_build_object('sessionId',v_session.id,'cycleNumber',1));
      end if;
    elsif v_pending_companies=0
       and v_session.status='COMPLETED'
       and coalesce(v_session.job_state,'COMPLETED') in ('COMPLETED','NO_RESULTS','EXHAUSTED')
       and (v_session.top_up_not_before is null or v_session.top_up_not_before<=now()) then
      v_next_cycle:=coalesce(v_session.cycle_number,0)+1;
      update public.discovery_sessions set
        status='QUEUED',job_state='QUEUED',stage='PREPARING',progress=0,
        candidates_found=0,recommendations_saved=0,attempt_count=0,
        last_error=null,last_error_code=null,last_error_message=null,
        started_at=null,completed_at=null,next_attempt_at=now(),next_retry_at=null,
        claimed_at=null,scheduler_run_id=null,lease_expires_at=null,heartbeat_at=null,last_heartbeat_at=null,
        result_summary_json=coalesce(result_summary_json,'{}'::jsonb)||jsonb_build_object('technicalFailure',false,'expansionPending',false),
        cycle_number=v_next_cycle,cycle_started_at=now(),cycle_baseline_company_count=v_total_companies,
        last_cycle_new_companies=0,top_up_not_before=null,updated_at=now()
      where id=v_session.id;
      v_company_topups:=v_company_topups+1;
      if not exists(select 1 from public.campaign_timeline where organisation_id=v_campaign.organisation_id and campaign_id=v_campaign.id and event_type='COMPANY_DISCOVERY_TOP_UP_QUEUED' and metadata_json->>'cycleNumber'=v_next_cycle::text) then
        insert into public.campaign_timeline(organisation_id,campaign_id,event_type,title,description,visibility,metadata_json)
        values(v_campaign.organisation_id,v_campaign.id,'COMPANY_DISCOVERY_TOP_UP_QUEUED','Company discovery continuing','The current company review batch has been cleared, so SalesPilot scheduled the next evidence-backed discovery cycle while downstream route research can continue in parallel.','CUSTOMER',jsonb_build_object('sessionId',v_session.id,'cycleNumber',v_next_cycle,'baselineCompanyCount',v_total_companies,'restartTrigger','REVIEW_BATCH_CLEARED'));
      end if;
      if not exists(select 1 from public.domain_outbox where organisation_id=v_campaign.organisation_id and event_type='CompanyDiscoveryTopUpQueued' and aggregate_id=v_session.id and payload_json->>'cycleNumber'=v_next_cycle::text) then
        v_event_id:=gen_random_uuid();
        insert into public.domain_outbox(organisation_id,event_id,event_type,aggregate_type,aggregate_id,payload_json,occurred_at)
        values(v_campaign.organisation_id,v_event_id,'CompanyDiscoveryTopUpQueued','DiscoverySession',v_session.id,jsonb_build_object('campaignId',v_campaign.id,'sessionId',v_session.id,'cycleNumber',v_next_cycle,'baselineCompanyCount',v_total_companies),now());
      end if;
    end if;
  end loop;

  v_preparation:=jsonb_build_object('campaignsInspected',v_campaigns,'companyJobsCreated',v_company_created,'companyTopUpsQueued',v_company_topups,'contactJobsCreated',0,'expiredCompanyLeasesRecovered',0,'expiredContactLeasesRecovered',0);
  update public.pipeline_scheduler_runs set preparation_json=v_preparation where id=p_run_id;
  return query select v_campaigns,v_company_created,v_company_topups,0,0,0;
exception when others then
  update public.pipeline_scheduler_runs set status='FAILED',completed_at=now(),last_error=left(sqlerrm,1000) where id=p_run_id;
  raise;
end $$;

-- 4) Remove obsolete G2/G3 worker entry points from application service-role use.
-- SECURITY DEFINER owned wrappers may still call implementation functions.
revoke execute on function public.claim_company_discovery() from service_role;
revoke execute on function public.fail_company_discovery(uuid,text) from service_role;
revoke execute on function public.record_company_discovery_failure(uuid,text,text,boolean) from service_role;
revoke execute on function public.heartbeat_company_discovery(uuid) from service_role;
revoke execute on function public.heartbeat_contact_discovery(uuid) from service_role;

revoke all on function public.prepare_pipeline_work(uuid) from public,anon,authenticated;
grant execute on function public.prepare_pipeline_work(uuid) to service_role;
revoke all on function public.record_company_discovery_failure_v2(uuid,text,text,boolean,text) from public,anon,authenticated;
-- Only the owned wrapper needs to invoke this as function owner.


-- 5) Campaign pause/resume is a pipeline control, not a G2 discovery-only toggle.
create or replace function public.control_salespilot_campaign(
  p_campaign_id uuid,p_organisation_id uuid,p_user_id uuid,p_action text,p_confirmation text
) returns void language plpgsql security definer set search_path=public as $$
declare c public.campaigns%rowtype; member_role text;
begin
  select role into member_role from public.organisation_memberships
  where organisation_id=p_organisation_id and user_id=p_user_id and status='ACTIVE' limit 1;
  if member_role not in ('OWNER','ADMIN') then raise exception 'campaign control forbidden'; end if;
  select * into c from public.campaigns where id=p_campaign_id and organisation_id=p_organisation_id for update;
  if c.id is null then raise exception 'campaign not found'; end if;

  if p_action='PAUSE' then
    if p_confirmation<>'pause' then raise exception 'confirmation mismatch'; end if;
    update public.campaigns set status='PAUSED',updated_at=now() where id=c.id;
    update public.discovery_sessions set status='PAUSED',job_state='PAUSED',claimed_at=null,scheduler_run_id=null,
      lease_expires_at=null,next_attempt_at=null,next_retry_at=null,updated_at=now()
    where campaign_id=c.id and coalesce(job_state,status) in ('QUEUED','RUNNING','FAILED_RETRYABLE');
    -- Contact table has no PAUSED legacy status; canonical job_state carries the pause.
    update public.contact_discovery_sessions set status='QUEUED',job_state='PAUSED',claimed_at=null,scheduler_run_id=null,
      lease_expires_at=null,next_attempt_at=null,next_retry_at=null,updated_at=now()
    where campaign_id=c.id and coalesce(job_state,status) in ('QUEUED','RUNNING','FAILED_RETRYABLE');
    -- Persist in-flight Engagement AI work without allowing it to be reclaimed while paused.
    update public.engagement_commercial_analyses set status='PENDING',scheduler_run_id=null,claimed_at=null,lease_expires_at=null,
      next_attempt_at='infinity'::timestamptz,updated_at=now()
    where campaign_id=c.id and status in ('PENDING','RUNNING','FAILED_RETRYABLE');
    update public.engagement_drafts set status='PENDING',scheduler_run_id=null,claimed_at=null,lease_expires_at=null,
      next_attempt_at='infinity'::timestamptz,updated_at=now()
    where campaign_id=c.id and status in ('PENDING','RUNNING','FAILED_RETRYABLE');
    update public.engagement_draft_reviews set status='PENDING',scheduler_run_id=null,claimed_at=null,lease_expires_at=null,
      next_attempt_at='infinity'::timestamptz,updated_at=now()
    where campaign_id=c.id and status in ('PENDING','RUNNING','FAILED_RETRYABLE');
    insert into public.campaign_timeline(organisation_id,campaign_id,event_type,title,description,visibility,metadata_json,occurred_at)
    values(c.organisation_id,c.id,'CAMPAIGN_PAUSED','Campaign paused','Autonomous campaign work has been paused. Saved progress remains available.','CUSTOMER','{}'::jsonb,now());
  elsif p_action='RESUME' then
    if p_confirmation<>'resume' then raise exception 'confirmation mismatch'; end if;
    update public.campaigns set status=case when exists(select 1 from public.companies where campaign_id=c.id) then 'READY' else 'PREPARING' end,updated_at=now() where id=c.id;
    update public.discovery_sessions set status='QUEUED',job_state='QUEUED',stage=case when coalesce(result_summary_json->>'expansionPending','false')='true' then 'EXPANDING' else 'PREPARING' end,
      next_attempt_at=now(),next_retry_at=null,claimed_at=null,scheduler_run_id=null,lease_expires_at=null,last_error=null,updated_at=now()
    where campaign_id=c.id and job_state='PAUSED';
    update public.contact_discovery_sessions set status='QUEUED',job_state='QUEUED',next_attempt_at=now(),next_retry_at=null,
      claimed_at=null,scheduler_run_id=null,lease_expires_at=null,updated_at=now()
    where campaign_id=c.id and job_state='PAUSED';
    update public.engagement_commercial_analyses set next_attempt_at=now(),updated_at=now() where campaign_id=c.id and status='PENDING' and next_attempt_at='infinity'::timestamptz;
    update public.engagement_drafts set next_attempt_at=now(),updated_at=now() where campaign_id=c.id and status='PENDING' and next_attempt_at='infinity'::timestamptz;
    update public.engagement_draft_reviews set next_attempt_at=now(),updated_at=now() where campaign_id=c.id and status='PENDING' and next_attempt_at='infinity'::timestamptz;
    insert into public.campaign_timeline(organisation_id,campaign_id,event_type,title,description,visibility,metadata_json,occurred_at)
    values(c.organisation_id,c.id,'CAMPAIGN_RESUMED','Campaign resumed','SalesPilot can continue autonomous work from the saved campaign state.','CUSTOMER','{}'::jsonb,now());
  elsif p_action='DELETE' then
    if p_confirmation<>c.name then raise exception 'confirmation mismatch'; end if;
    delete from public.campaigns where id=c.id and organisation_id=c.organisation_id;
  else raise exception 'invalid campaign action'; end if;
end $$;


create or replace function public.assert_company_discovery_owner(p_session_id uuid,p_scheduler_run_id uuid,p_require_running boolean default true)
returns void language plpgsql security definer set search_path=public as $$
declare s public.discovery_sessions%rowtype; v_campaign_status text;
begin
 perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
 select * into s from public.discovery_sessions where id=p_session_id for update;
 if s.id is null then raise exception 'COMPANY_DISCOVERY_OWNERSHIP_LOST'; end if;
 select status into v_campaign_status from public.campaigns where id=s.campaign_id;
 if v_campaign_status='PAUSED' or s.scheduler_run_id is distinct from p_scheduler_run_id
    or (p_require_running and (s.status<>'RUNNING' or coalesce(s.job_state,'RUNNING')<>'RUNNING')) then
   raise exception 'COMPANY_DISCOVERY_OWNERSHIP_LOST';
 end if;
end $$;

create or replace function public.assert_contact_discovery_owner(p_session_id uuid,p_scheduler_run_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare s public.contact_discovery_sessions%rowtype; v_campaign_status text;
begin
 perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
 select * into s from public.contact_discovery_sessions where id=p_session_id for update;
 if s.id is null then raise exception 'CONTACT_DISCOVERY_OWNERSHIP_LOST'; end if;
 select status into v_campaign_status from public.campaigns where id=s.campaign_id;
 if v_campaign_status='PAUSED' or s.scheduler_run_id is distinct from p_scheduler_run_id
    or s.status<>'RUNNING' or coalesce(s.job_state,'RUNNING')<>'RUNNING' then
   raise exception 'CONTACT_DISCOVERY_OWNERSHIP_LOST';
 end if;
end $$;


-- Engagement bridge ignores paused/archived campaigns.
create or replace function public.sync_opportunity_engagement_bridge(p_scheduler_run_id uuid)
returns table(created integer,updated integer,cancelled integer,"readyForDraft" integer,"needsRoute" integer)
language plpgsql security definer set search_path=public as $$
declare
  v_opp record;
  v_existing public.opportunity_engagements%rowtype;
  v_policy public.campaign_autonomy_policies%rowtype;
  v_email text;
  v_linkedin text;
  v_channel text;
  v_route_status text;
  v_route_source text;
  v_next_status text;
  v_engagement_id uuid;
  v_created integer:=0;
  v_updated integer:=0;
  v_cancelled integer:=0;
  v_ready integer:=0;
  v_needs integer:=0;
  v_changed boolean;
  v_event_id uuid;
begin
  if not exists(select 1 from public.pipeline_scheduler_runs where id=p_scheduler_run_id) then
    raise exception 'scheduler run required';
  end if;

  for v_opp in
    select
      o.*,
      ct.full_name as contact_name,
      ct.role_title as contact_role,
      ct.email_address as contact_email,
      ct.email_status as contact_email_status,
      ct.linkedin_profile_url as contact_linkedin,
      ch.email_address as route_email,
      ch.verification_status as route_verification_status,
      ch.source_url as route_source_url
    from public.opportunities o
    join public.campaigns active_ca on active_ca.id=o.campaign_id and active_ca.organisation_id=o.organisation_id and active_ca.status not in ('PAUSED','ARCHIVED')
    left join public.contacts ct on ct.id=o.primary_contact_id
    left join lateral (
      select cch.*
      from public.company_contact_channels cch
      where cch.organisation_id=o.organisation_id
        and cch.campaign_id=o.campaign_id
        and cch.company_id=o.company_id
        and cch.deliverability_status not in ('UNDELIVERABLE','BOUNCED')
      order by cch.is_primary desc,cch.routing_score desc,cch.created_at
      limit 1
    ) ch on true
    where o.status='APPROVED'
    order by o.campaign_id,o.rank,o.created_at
  loop
    select * into v_policy from public.campaign_autonomy_policies
    where organisation_id=v_opp.organisation_id and campaign_id=v_opp.campaign_id;
    if v_policy.campaign_id is null then
      insert into public.campaign_autonomy_policies(campaign_id,organisation_id)
      values(v_opp.campaign_id,v_opp.organisation_id)
      on conflict(campaign_id) do nothing;
      select * into v_policy from public.campaign_autonomy_policies
      where organisation_id=v_opp.organisation_id and campaign_id=v_opp.campaign_id;
    end if;

    v_email:=case
      when nullif(trim(coalesce(v_opp.contact_email,'')),'') is not null
        and coalesce(v_opp.contact_email_status,'UNKNOWN') in ('VERIFIED','LIKELY')
        then lower(trim(v_opp.contact_email))
      when nullif(trim(coalesce(v_opp.route_email,'')),'') is not null
        then lower(trim(v_opp.route_email))
      else null
    end;
    v_linkedin:=nullif(trim(coalesce(v_opp.contact_linkedin,'')),'');
    v_channel:=case when v_email is not null then 'EMAIL' when v_linkedin is not null then 'LINKEDIN' else 'NONE' end;
    v_route_status:=case when v_email=v_opp.contact_email then v_opp.contact_email_status else v_opp.route_verification_status end;
    v_route_source:=case when v_email=v_opp.route_email then v_opp.route_source_url else null end;
    v_next_status:=case when v_channel='NONE' then 'NEEDS_ROUTE' else 'READY_FOR_DRAFT' end;

    select * into v_existing from public.opportunity_engagements
    where organisation_id=v_opp.organisation_id and campaign_id=v_opp.campaign_id and opportunity_id=v_opp.id
    for update;

    if v_existing.id is null then
      insert into public.opportunity_engagements(
        organisation_id,campaign_id,opportunity_id,company_id,contact_id,status,
        outreach_policy,reply_policy,market_learning_enabled,channel_type,
        recipient_name,recipient_role,recipient_email,linkedin_profile_url,
        route_verification_status,route_source_url,source_opportunity_score,source_opportunity_rank
      ) values(
        v_opp.organisation_id,v_opp.campaign_id,v_opp.id,v_opp.company_id,v_opp.primary_contact_id,v_next_status,
        coalesce(v_policy.outreach_approval,'MANUAL'),coalesce(v_policy.reply_handling,'SUGGEST'),coalesce(v_policy.market_learning_enabled,false),v_channel,
        v_opp.contact_name,v_opp.contact_role,v_email,v_linkedin,
        v_route_status,v_route_source,v_opp.opportunity_score,v_opp.rank
      ) returning id into v_engagement_id;
      v_created:=v_created+1;
      insert into public.opportunity_engagement_history(
        organisation_id,campaign_id,engagement_id,opportunity_id,event_type,next_status,metadata_json
      ) values(
        v_opp.organisation_id,v_opp.campaign_id,v_engagement_id,v_opp.id,'PREPARED',v_next_status,
        jsonb_build_object('schedulerRunId',p_scheduler_run_id,'channelType',v_channel,'outreachPolicy',coalesce(v_policy.outreach_approval,'MANUAL'))
      );
      if not exists(
        select 1 from public.campaign_timeline t
        where t.organisation_id=v_opp.organisation_id and t.campaign_id=v_opp.campaign_id
          and t.event_type='ENGAGEMENT_PREPARED' and t.metadata_json->>'opportunityId'=v_opp.id::text
      ) then
        insert into public.campaign_timeline(
          organisation_id,campaign_id,event_type,title,description,visibility,metadata_json
        ) values(
          v_opp.organisation_id,v_opp.campaign_id,'ENGAGEMENT_PREPARED','Opportunity prepared for engagement',
          case when v_next_status='READY_FOR_DRAFT'
            then 'SalesPilot selected the strongest supported route and prepared this opportunity for personalised outreach.'
            else 'The opportunity is approved, but SalesPilot still needs a supported contact route before outreach can be prepared.' end,
          'CUSTOMER',jsonb_build_object('opportunityId',v_opp.id,'engagementId',v_engagement_id,'channelType',v_channel,'status',v_next_status)
        );
      end if;
      v_event_id:=gen_random_uuid();
      insert into public.domain_outbox(
        organisation_id,event_id,event_type,aggregate_type,aggregate_id,payload_json,occurred_at
      ) values(
        v_opp.organisation_id,v_event_id,'EngagementPrepared','OpportunityEngagement',v_engagement_id,
        jsonb_build_object('campaignId',v_opp.campaign_id,'opportunityId',v_opp.id,'companyId',v_opp.company_id,
          'contactId',v_opp.primary_contact_id,'status',v_next_status,'channelType',v_channel),now()
      );
    else
      v_changed:=v_existing.contact_id is distinct from v_opp.primary_contact_id
        or v_existing.status is distinct from v_next_status
        or v_existing.channel_type is distinct from v_channel
        or v_existing.recipient_email is distinct from v_email
        or v_existing.linkedin_profile_url is distinct from v_linkedin
        or v_existing.outreach_policy is distinct from coalesce(v_policy.outreach_approval,'MANUAL')
        or v_existing.reply_policy is distinct from coalesce(v_policy.reply_handling,'SUGGEST')
        or v_existing.market_learning_enabled is distinct from coalesce(v_policy.market_learning_enabled,false)
        or v_existing.source_opportunity_score is distinct from v_opp.opportunity_score
        or v_existing.source_opportunity_rank is distinct from v_opp.rank;

      if v_changed and v_existing.status not in ('SENT','QUEUED_FOR_SEND','APPROVED_TO_SEND','DRAFT_REVIEW') then
        update public.opportunity_engagements set
          contact_id=v_opp.primary_contact_id,status=v_next_status,
          outreach_policy=coalesce(v_policy.outreach_approval,'MANUAL'),
          reply_policy=coalesce(v_policy.reply_handling,'SUGGEST'),
          market_learning_enabled=coalesce(v_policy.market_learning_enabled,false),
          channel_type=v_channel,recipient_name=v_opp.contact_name,recipient_role=v_opp.contact_role,
          recipient_email=v_email,linkedin_profile_url=v_linkedin,
          route_verification_status=v_route_status,route_source_url=v_route_source,
          source_opportunity_score=v_opp.opportunity_score,source_opportunity_rank=v_opp.rank,updated_at=now()
        where id=v_existing.id;
        insert into public.opportunity_engagement_history(
          organisation_id,campaign_id,engagement_id,opportunity_id,event_type,previous_status,next_status,metadata_json
        ) values(
          v_opp.organisation_id,v_opp.campaign_id,v_existing.id,v_opp.id,
          case when v_existing.channel_type is distinct from v_channel or v_existing.recipient_email is distinct from v_email then 'ROUTE_UPDATED' else 'POLICY_UPDATED' end,
          v_existing.status,v_next_status,jsonb_build_object('schedulerRunId',p_scheduler_run_id,'channelType',v_channel)
        );
        v_updated:=v_updated+1;
      end if;
    end if;

    if v_next_status='READY_FOR_DRAFT' then v_ready:=v_ready+1; else v_needs:=v_needs+1; end if;
  end loop;

  for v_existing in
    select e.* from public.opportunity_engagements e
    join public.opportunities o on o.id=e.opportunity_id
    where o.status='REJECTED' and e.status not in ('SENT','CANCELLED')
    for update of e
  loop
    update public.opportunity_engagements set status='CANCELLED',updated_at=now() where id=v_existing.id;
    insert into public.opportunity_engagement_history(
      organisation_id,campaign_id,engagement_id,opportunity_id,event_type,previous_status,next_status,metadata_json
    ) values(
      v_existing.organisation_id,v_existing.campaign_id,v_existing.id,v_existing.opportunity_id,
      'CANCELLED',v_existing.status,'CANCELLED',jsonb_build_object('schedulerRunId',p_scheduler_run_id,'reason','OPPORTUNITY_REJECTED')
    );
    v_cancelled:=v_cancelled+1;
  end loop;

  return query select v_created,v_updated,v_cancelled,v_ready,v_needs;
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
  join public.campaigns active_ca on active_ca.id=e.campaign_id and active_ca.status not in ('PAUSED','ARCHIVED')
  where e.status='READY_FOR_DRAFT'
  on conflict on constraint engagement_commercial_analyses_engagement_id_key do nothing;

  select a.id into v_id from public.engagement_commercial_analyses a
  join public.opportunity_engagements e on e.id=a.engagement_id and e.status='READY_FOR_DRAFT'
  join public.campaigns active_ca on active_ca.id=e.campaign_id and active_ca.status not in ('PAUSED','ARCHIVED')
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
  join public.campaigns active_ca on active_ca.id=e.campaign_id and active_ca.status not in ('PAUSED','ARCHIVED')
  where e.status='READY_FOR_DRAFT' and coalesce(e.primary_channel,e.channel_type)<>'NONE'
  on conflict on constraint engagement_drafts_engagement_id_key do nothing;

  select d.id into v_id
  from public.engagement_drafts d
  join public.opportunity_engagements e on e.id=d.engagement_id and e.status='READY_FOR_DRAFT' and coalesce(e.primary_channel,e.channel_type)<>'NONE'
  join public.engagement_commercial_analyses a on a.id=d.commercial_analysis_id and a.status='COMPLETE'
  join public.campaigns active_ca on active_ca.id=e.campaign_id and active_ca.status not in ('PAUSED','ARCHIVED')
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
  join public.campaigns active_ca on active_ca.id=d.campaign_id and active_ca.status not in ('PAUSED','ARCHIVED')
  where d.status='COMPLETE'
  on conflict on constraint engagement_draft_reviews_draft_id_key do nothing;

  select r.id into v_id
  from public.engagement_draft_reviews r
  join public.engagement_drafts d on d.id=r.draft_id and d.status='COMPLETE'
  join public.opportunity_engagements e on e.id=r.engagement_id and e.status='DRAFT_READY'
  join public.campaigns active_ca on active_ca.id=e.campaign_id and active_ca.status not in ('PAUSED','ARCHIVED')
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


revoke execute on function public.claim_contact_discovery() from service_role;
revoke execute on function public.fail_contact_discovery(uuid,text) from service_role;
revoke execute on function public.complete_company_discovery(uuid,jsonb) from service_role;
revoke execute on function public.record_company_discovery_failure_v2(uuid,text,text,boolean,text) from service_role;
revoke execute on function public.claim_engagement_commercial_reasoning(uuid) from service_role;
revoke execute on function public.claim_engagement_outreach_generation(uuid) from service_role;
revoke execute on function public.claim_engagement_self_review(uuid) from service_role;

revoke all on function public.control_salespilot_campaign(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.control_salespilot_campaign(uuid,uuid,uuid,text,text) to service_role;


-- 8) Paused campaigns must not advance into the send queue. The legacy queue
-- builder scanned every APPROVED_TO_SEND engagement regardless of campaign state.
create or replace function public.run_engagement_queue_builder(p_scheduler_run_id uuid)
returns table(inspected integer,queued integer,held integer,already_queued integer)
language plpgsql security definer set search_path=public as $$
declare v record; v_tz record; v_draft_id uuid; v_address text; v_scheduled timestamptz; v_inspected integer:=0; v_queued integer:=0; v_held integer:=0; v_existing integer:=0; v_event_id uuid;
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);

  for v in
    select e.*,c.location contact_location,co.country company_country
    from public.opportunity_engagements e
    join public.campaigns active_ca on active_ca.id=e.campaign_id
      and active_ca.organisation_id=e.organisation_id
      and active_ca.status not in ('PAUSED','ARCHIVED')
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

-- 9) campaign.status is lifecycle state only. FAILED was a G2 transient worker
-- state and is no longer written by the modern pipeline. Repair old rows and
-- remove it from the persisted campaign-state contract.
update public.campaigns c
set status=case
  when exists(select 1 from public.companies co where co.organisation_id=c.organisation_id and co.campaign_id=c.id) then 'READY'
  when exists(select 1 from public.discovery_sessions ds where ds.organisation_id=c.organisation_id and ds.campaign_id=c.id) then 'PREPARING'
  else 'PREPARING'
end,updated_at=now()
where c.status='FAILED';

alter table public.campaigns drop constraint if exists campaigns_status_check;
alter table public.campaigns add constraint campaigns_status_check
  check (status in ('DRAFT','PREPARING','READY','PAUSED','ARCHIVED'));

-- Genesis G3 reliability patch: prevent company top-up event/worker loops.
-- Safe to apply after 0016 and safe to rerun.

alter table public.discovery_sessions
  add column if not exists cycle_baseline_company_count integer not null default 0 check (cycle_baseline_company_count >= 0),
  add column if not exists last_cycle_new_companies integer not null default 0 check (last_cycle_new_companies >= 0),
  add column if not exists consecutive_empty_cycles integer not null default 0 check (consecutive_empty_cycles >= 0),
  add column if not exists top_up_not_before timestamptz;

-- Queue at most one company-discovery cycle. Empty cycles use progressive
-- cooldowns, so a campaign cannot be reopened on every pipeline cron tick.
create or replace function public.ensure_company_review_queue(
  p_organisation_id uuid,
  p_campaign_id uuid
) returns boolean
language plpgsql security definer set search_path=public as $$
declare
  v_campaign public.campaigns%rowtype;
  v_session public.discovery_sessions%rowtype;
  v_pending integer;
  v_total integer;
  v_floor integer;
  v_event_id uuid;
  v_next_cycle integer;
begin
  select * into v_campaign
  from public.campaigns
  where id=p_campaign_id and organisation_id=p_organisation_id
  for update;

  if v_campaign.id is null then raise exception 'campaign not found'; end if;
  if v_campaign.status in ('PAUSED','ARCHIVED','CANCELLED') then return false; end if;

  select
    count(*) filter (where review_status='PENDING_REVIEW'),
    count(*)
  into v_pending,v_total
  from public.companies
  where organisation_id=p_organisation_id
    and campaign_id=p_campaign_id;

  select * into v_session
  from public.discovery_sessions
  where organisation_id=p_organisation_id and campaign_id=p_campaign_id
  for update;

  if v_session.id is null then
    insert into public.discovery_sessions(
      organisation_id,campaign_id,status,stage,progress,next_attempt_at,
      cycle_number,cycle_started_at,queue_floor,
      cycle_baseline_company_count,last_cycle_new_companies,
      consecutive_empty_cycles,top_up_not_before
    ) values(
      p_organisation_id,p_campaign_id,'QUEUED','PREPARING',0,now(),
      1,now(),6,v_total,0,0,null
    ) returning * into v_session;

    return true;
  end if;

  v_floor:=coalesce(v_session.queue_floor,6);

  if v_pending>=v_floor then return false; end if;
  if v_session.status in ('QUEUED','RUNNING') then return false; end if;
  if v_session.top_up_not_before is not null and v_session.top_up_not_before>now() then return false; end if;

  v_next_cycle:=v_session.cycle_number+1;

  update public.discovery_sessions set
    status='QUEUED',stage='PREPARING',progress=0,
    candidates_found=0,recommendations_saved=0,
    attempt_count=0,last_error=null,started_at=null,completed_at=null,
    next_attempt_at=now(),lease_expires_at=null,heartbeat_at=null,
    cycle_number=v_next_cycle,cycle_started_at=now(),
    cycle_baseline_company_count=v_total,
    last_cycle_new_companies=0,
    top_up_not_before=null,
    updated_at=now()
  where id=v_session.id;

  insert into public.campaign_timeline(
    organisation_id,campaign_id,event_type,title,description,visibility,metadata_json
  ) values(
    p_organisation_id,p_campaign_id,'COMPANY_DISCOVERY_TOP_UP_QUEUED',
    'Company discovery continuing',
    'The review queue fell below six, so MarketRoute automatically started another evidence-backed company search.',
    'CUSTOMER',
    jsonb_build_object(
      'sessionId',v_session.id,
      'pendingCount',v_pending,
      'queueFloor',v_floor,
      'cycleNumber',v_next_cycle,
      'baselineCompanyCount',v_total
    )
  );

  v_event_id:=gen_random_uuid();
  insert into public.domain_outbox(
    organisation_id,event_id,event_type,aggregate_type,aggregate_id,payload_json,occurred_at
  ) values(
    p_organisation_id,v_event_id,'CompanyDiscoveryTopUpQueued','DiscoverySession',v_session.id,
    jsonb_build_object(
      'campaignId',p_campaign_id,
      'sessionId',v_session.id,
      'pendingCount',v_pending,
      'queueFloor',v_floor,
      'cycleNumber',v_next_cycle,
      'baselineCompanyCount',v_total
    ),now()
  );

  return true;
end $$;

-- Finalisation records how many genuinely new campaign companies were added in
-- this cycle. A zero-result cycle completes cleanly and backs off rather than
-- immediately reopening on the next cron tick.
create or replace function public.finalize_company_discovery(p_session_id uuid)
returns integer
language plpgsql security definer set search_path=public as $$
declare
  s public.discovery_sessions%rowtype;
  v_total integer;
  v_new integer;
  v_empty_cycles integer;
  v_cooldown interval;
begin
  select * into s
  from public.discovery_sessions
  where id=p_session_id
  for update;

  if s.id is null then raise exception 'discovery session missing'; end if;
  if s.status='COMPLETED' then return s.recommendations_saved; end if;

  select count(*) into v_total
  from public.companies
  where organisation_id=s.organisation_id
    and campaign_id=s.campaign_id;

  v_new:=greatest(v_total-coalesce(s.cycle_baseline_company_count,0),0);
  v_empty_cycles:=case when v_new>0 then 0 else coalesce(s.consecutive_empty_cycles,0)+1 end;

  v_cooldown:=case
    when v_new>0 then interval '0 seconds'
    when v_empty_cycles=1 then interval '30 minutes'
    when v_empty_cycles=2 then interval '2 hours'
    else interval '12 hours'
  end;

  update public.discovery_sessions set
    status='COMPLETED',stage='COMPLETE',progress=100,
    recommendations_saved=v_total,
    last_cycle_new_companies=v_new,
    consecutive_empty_cycles=v_empty_cycles,
    top_up_not_before=case when v_new>0 then null else now()+v_cooldown end,
    completed_at=now(),heartbeat_at=now(),lease_expires_at=null,
    next_attempt_at=null,updated_at=now()
  where id=s.id;

  update public.campaigns
  set status='READY',updated_at=now()
  where id=s.campaign_id;

  if not exists(
    select 1 from public.campaign_timeline
    where campaign_id=s.campaign_id
      and event_type='COMPANY_DISCOVERY_COMPLETED'
  ) then
    insert into public.campaign_timeline(
      organisation_id,campaign_id,event_type,title,description,visibility,metadata_json
    ) values(
      s.organisation_id,s.campaign_id,'COMPANY_DISCOVERY_COMPLETED',
      'Companies ready for review',
      v_total||' matching companies are ready for your review.',
      'CUSTOMER',jsonb_build_object('companyCount',v_total)
    );
  end if;

  if v_new>0 then
    perform public.record_discovery_activity(
      s.id,'DISCOVERY_TOP_UP_COMPLETE','New company recommendations added',
      v_new||' new evidence-backed compan'||case when v_new=1 then 'y is' else 'ies are' end||' ready for review.',
      jsonb_build_object('newCompanyCount',v_new,'companyCount',v_total,'cycleNumber',s.cycle_number)
    );
  else
    perform public.record_discovery_activity(
      s.id,'DISCOVERY_TOP_UP_PAUSED','No new unique companies found',
      'MarketRoute exhausted the current search angle and paused before widening the research again.',
      jsonb_build_object(
        'newCompanyCount',0,
        'companyCount',v_total,
        'cycleNumber',s.cycle_number,
        'emptyCycleCount',v_empty_cycles,
        'retryAfterSeconds',extract(epoch from v_cooldown)::integer
      )
    );
  end if;

  return v_total;
end $$;

revoke all on function public.ensure_company_review_queue(uuid,uuid) from public,anon,authenticated;
revoke all on function public.finalize_company_discovery(uuid) from public,anon,authenticated;
grant execute on function public.ensure_company_review_queue(uuid,uuid) to service_role;
grant execute on function public.finalize_company_discovery(uuid) to service_role;

-- Stop a currently completed empty cycle from immediately reopening after this
-- migration. Successful cycles remain eligible for normal queue maintenance.
update public.discovery_sessions
set top_up_not_before=now()+interval '30 minutes',
    consecutive_empty_cycles=greatest(consecutive_empty_cycles,1),
    updated_at=now()
where status='COMPLETED'
  and coalesce(recommendations_saved,0)>0
  and top_up_not_before is null
  and exists (
    select 1
    from public.companies c
    where c.organisation_id=discovery_sessions.organisation_id
      and c.campaign_id=discovery_sessions.campaign_id
  );

-- Remove only the recent duplicated timeline spam caused by the loop, keeping
-- the newest event per campaign. Historical valid top-up cycles are untouched.
with recent_duplicates as (
  select id,
         row_number() over (
           partition by organisation_id,campaign_id,event_type
           order by occurred_at desc,id desc
         ) as rn
  from public.campaign_timeline
  where event_type='COMPANY_DISCOVERY_TOP_UP_QUEUED'
    and occurred_at>=now()-interval '2 hours'
)
delete from public.campaign_timeline t
using recent_duplicates d
where t.id=d.id and d.rn>1;

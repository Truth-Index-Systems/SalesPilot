-- Genesis G3 definitive worker guard.
-- Fixes repeated company top-up events caused by FAILED sessions being
-- re-queued on every cron tick and recovers visibly stranded contact jobs.
-- Safe to apply after 0019 and safe to rerun.

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
    );
    return true;
  end if;

  v_floor:=coalesce(v_session.queue_floor,6);
  if v_pending>=v_floor then return false; end if;

  -- QUEUED/RUNNING already represents an active cycle. FAILED is owned by the
  -- retry scheduler and must never be reopened here, otherwise every cron tick
  -- bypasses next_attempt_at and emits another timeline event.
  if v_session.status in ('QUEUED','RUNNING','FAILED') then return false; end if;
  if v_session.status<>'COMPLETED' then return false; end if;
  if v_session.top_up_not_before is not null and v_session.top_up_not_before>now() then return false; end if;

  v_next_cycle:=coalesce(v_session.cycle_number,0)+1;

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

  -- Defensive dedupe: even under concurrent callers, record no more than one
  -- customer event for the same persisted cycle number.
  if not exists (
    select 1 from public.campaign_timeline
    where organisation_id=p_organisation_id
      and campaign_id=p_campaign_id
      and event_type='COMPANY_DISCOVERY_TOP_UP_QUEUED'
      and metadata_json->>'cycleNumber'=v_next_cycle::text
  ) then
    insert into public.campaign_timeline(
      organisation_id,campaign_id,event_type,title,description,visibility,metadata_json
    ) values(
      p_organisation_id,p_campaign_id,'COMPANY_DISCOVERY_TOP_UP_QUEUED',
      'Company discovery continuing',
      'The review queue fell below six, so SalesPilot automatically started another evidence-backed company search.',
      'CUSTOMER',
      jsonb_build_object(
        'sessionId',v_session.id,
        'pendingCount',v_pending,
        'queueFloor',v_floor,
        'cycleNumber',v_next_cycle,
        'baselineCompanyCount',v_total
      )
    );
  end if;

  v_event_id:=gen_random_uuid();
  if not exists (
    select 1 from public.domain_outbox
    where organisation_id=p_organisation_id
      and event_type='CompanyDiscoveryTopUpQueued'
      and aggregate_id=v_session.id
      and payload_json->>'cycleNumber'=v_next_cycle::text
  ) then
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
  end if;

  return true;
end $$;

revoke all on function public.ensure_company_review_queue(uuid,uuid) from public,anon,authenticated;
grant execute on function public.ensure_company_review_queue(uuid,uuid) to service_role;

-- Recover jobs that remained visibly active because the failed TypeScript build
-- prevented the newest worker from deploying. They become orderly retries, not
-- permanent 30/40% research states.
update public.contact_discovery_sessions
set status='FAILED',
    stage='PREPARING',
    progress=0,
    result_status='FAILED',
    last_error=coalesce(last_error,'RECOVERED_AFTER_FAILED_DEPLOYMENT'),
    lease_expires_at=null,
    heartbeat_at=now(),
    next_attempt_at=now(),
    updated_at=now()
where status='RUNNING'
  and (lease_expires_at is null or lease_expires_at<now() or updated_at<now()-interval '6 minutes');

-- If historical loop spam used a different cycle number on every tick, retain
-- only the newest recent top-up event. This is presentation cleanup only.
with recent_topups as (
  select id,
         row_number() over (
           partition by organisation_id,campaign_id,event_type
           order by occurred_at desc,id desc
         ) as rn
  from public.campaign_timeline
  where event_type='COMPANY_DISCOVERY_TOP_UP_QUEUED'
    and occurred_at>=now()-interval '24 hours'
)
delete from public.campaign_timeline t
using recent_topups d
where t.id=d.id and d.rn>1;

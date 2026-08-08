-- Genesis Stabilisation S4: orchestration consolidation.
-- Removes every legacy trigger/function that could create or reopen autonomous
-- work outside the single pipeline scheduler introduced in S2.
-- Existing campaign, company, contact, evidence and history data is preserved.

-- ---------------------------------------------------------------------------
-- 1. Remove trigger-owned orchestration.
-- ---------------------------------------------------------------------------
drop trigger if exists domain_outbox_queue_company_discovery on public.domain_outbox;
drop trigger if exists companies_queue_contact_discovery on public.companies;
drop trigger if exists companies_keep_review_queue_healthy on public.companies;
drop trigger if exists contacts_refresh_campaign_readiness on public.contacts;
drop trigger if exists contact_sessions_refresh_campaign_readiness on public.contact_discovery_sessions;

-- Trigger functions are no longer part of the runtime boundary.
drop function if exists public.queue_company_discovery_from_campaign_created();
drop function if exists public.queue_contact_discovery_after_company_review();
drop function if exists public.keep_company_review_queue_healthy();
drop function if exists public.refresh_contact_readiness_after_review();
drop function if exists public.refresh_readiness_after_contact_session();

-- Legacy orchestration RPCs are removed after the scheduler implementation
-- below stops depending on them. Claim/progress/save/finalise worker RPCs remain.
drop function if exists public.ensure_active_company_review_queues();
drop function if exists public.ensure_company_review_queue(uuid,uuid);
drop function if exists public.queue_contact_discovery_for_company(uuid,uuid,uuid);
drop function if exists public.refresh_campaign_contact_readiness(uuid,uuid);

-- ---------------------------------------------------------------------------
-- 2. Scheduler-owned work preparation and campaign hand-off.
-- ---------------------------------------------------------------------------
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
  v_company public.companies%rowtype;
  v_count integer:=0;
  v_campaigns integer:=0;
  v_company_created integer:=0;
  v_company_topups integer:=0;
  v_contact_created integer:=0;
  v_company_recovered integer:=0;
  v_contact_recovered integer:=0;
  v_pending_companies integer:=0;
  v_total_companies integer:=0;
  v_queue_floor integer:=6;
  v_next_cycle integer:=1;
  v_pending_contacts integer:=0;
  v_approved_contacts integer:=0;
  v_active_contact_jobs integer:=0;
  v_event_id uuid;
  v_preparation jsonb;
begin
  if not exists(
    select 1 from public.pipeline_scheduler_lease
    where singleton=true and run_id=p_run_id and lease_expires_at>now()
  ) then
    raise exception 'PIPELINE_SCHEDULER_LEASE_NOT_HELD';
  end if;

  -- Expired work is recovered exactly once by the scheduler. It is not
  -- reopened here; retry timing remains owned by the claim/retry boundary.
  update public.discovery_sessions
  set status='FAILED',stage='PREPARING',progress=0,
      last_error='WORKER_LEASE_EXPIRED',next_attempt_at=now(),
      lease_expires_at=null,heartbeat_at=now(),updated_at=now()
  where status='RUNNING' and lease_expires_at is not null and lease_expires_at<=now();
  get diagnostics v_company_recovered=row_count;

  update public.contact_discovery_sessions
  set status='FAILED',stage='PREPARING',progress=0,
      result_status='FAILED',last_error='WORKER_LEASE_EXPIRED',next_attempt_at=now(),
      lease_expires_at=null,heartbeat_at=now(),updated_at=now()
  where status='RUNNING' and lease_expires_at is not null and lease_expires_at<=now();
  get diagnostics v_contact_recovered=row_count;

  for v_campaign in
    select c.*
    from public.campaigns c
    where c.status in ('PREPARING','READY')
    order by c.created_at
    for update skip locked
  loop
    v_campaigns:=v_campaigns+1;

    select count(*) filter (where review_status='PENDING_REVIEW'),count(*)
    into v_pending_companies,v_total_companies
    from public.companies
    where organisation_id=v_campaign.organisation_id
      and campaign_id=v_campaign.id;

    select * into v_session
    from public.discovery_sessions
    where organisation_id=v_campaign.organisation_id
      and campaign_id=v_campaign.id
    for update;

    -- Initial company work is created only by the scheduler.
    if v_session.id is null then
      insert into public.discovery_sessions(
        organisation_id,campaign_id,status,stage,progress,next_attempt_at,
        cycle_number,cycle_started_at,queue_floor,cycle_baseline_company_count,
        last_cycle_new_companies,consecutive_empty_cycles,top_up_not_before
      ) values(
        v_campaign.organisation_id,v_campaign.id,'QUEUED','PREPARING',0,now(),
        1,now(),6,v_total_companies,0,0,null
      ) returning * into v_session;

      v_company_created:=v_company_created+1;

      if not exists(
        select 1 from public.campaign_timeline
        where organisation_id=v_campaign.organisation_id
          and campaign_id=v_campaign.id
          and event_type='COMPANY_DISCOVERY_QUEUED'
      ) then
        insert into public.campaign_timeline(
          organisation_id,campaign_id,event_type,title,description,visibility,metadata_json
        ) values(
          v_campaign.organisation_id,v_campaign.id,'COMPANY_DISCOVERY_QUEUED',
          'Company discovery queued',
          'MarketRoute is preparing to find companies that match the approved campaign.',
          'CUSTOMER',jsonb_build_object('sessionId',v_session.id,'cycleNumber',1)
        );
      end if;
    else
      v_queue_floor:=coalesce(v_session.queue_floor,6);

      -- A completed cycle may be reopened only here, under the scheduler lease,
      -- after its persisted cooldown. FAILED jobs remain owned by retry logic.
      if v_pending_companies<v_queue_floor
         and v_session.status='COMPLETED'
         and (v_session.top_up_not_before is null or v_session.top_up_not_before<=now()) then
        v_next_cycle:=coalesce(v_session.cycle_number,0)+1;

        update public.discovery_sessions
        set status='QUEUED',stage='PREPARING',progress=0,
            candidates_found=0,recommendations_saved=0,
            attempt_count=0,last_error=null,started_at=null,completed_at=null,
            next_attempt_at=now(),lease_expires_at=null,heartbeat_at=null,
            cycle_number=v_next_cycle,cycle_started_at=now(),
            cycle_baseline_company_count=v_total_companies,
            last_cycle_new_companies=0,top_up_not_before=null,updated_at=now()
        where id=v_session.id;

        v_company_topups:=v_company_topups+1;

        if not exists(
          select 1 from public.campaign_timeline
          where organisation_id=v_campaign.organisation_id
            and campaign_id=v_campaign.id
            and event_type='COMPANY_DISCOVERY_TOP_UP_QUEUED'
            and metadata_json->>'cycleNumber'=v_next_cycle::text
        ) then
          insert into public.campaign_timeline(
            organisation_id,campaign_id,event_type,title,description,visibility,metadata_json
          ) values(
            v_campaign.organisation_id,v_campaign.id,'COMPANY_DISCOVERY_TOP_UP_QUEUED',
            'Company discovery continuing',
            'The review queue fell below six, so MarketRoute scheduled one new evidence-backed discovery cycle.',
            'CUSTOMER',jsonb_build_object(
              'sessionId',v_session.id,'pendingCount',v_pending_companies,
              'queueFloor',v_queue_floor,'cycleNumber',v_next_cycle,
              'baselineCompanyCount',v_total_companies
            )
          );
        end if;

        if not exists(
          select 1 from public.domain_outbox
          where organisation_id=v_campaign.organisation_id
            and event_type='CompanyDiscoveryTopUpQueued'
            and aggregate_id=v_session.id
            and payload_json->>'cycleNumber'=v_next_cycle::text
        ) then
          v_event_id:=gen_random_uuid();
          insert into public.domain_outbox(
            organisation_id,event_id,event_type,aggregate_type,aggregate_id,payload_json,occurred_at
          ) values(
            v_campaign.organisation_id,v_event_id,'CompanyDiscoveryTopUpQueued',
            'DiscoverySession',v_session.id,
            jsonb_build_object(
              'campaignId',v_campaign.id,'sessionId',v_session.id,
              'pendingCount',v_pending_companies,'queueFloor',v_queue_floor,
              'cycleNumber',v_next_cycle,'baselineCompanyCount',v_total_companies
            ),now()
          );
        end if;
      end if;
    end if;

    -- Contact jobs are created only by the scheduler for currently approved
    -- companies. The existing unique key makes this operation idempotent.
    for v_company in
      select co.*
      from public.companies co
      where co.organisation_id=v_campaign.organisation_id
        and co.campaign_id=v_campaign.id
        and co.review_status='APPROVED'
        and not exists(
          select 1 from public.contact_discovery_sessions cs
          where cs.organisation_id=co.organisation_id
            and cs.campaign_id=co.campaign_id
            and cs.company_id=co.id
        )
      order by co.reviewed_at nulls last,co.created_at
      for update skip locked
    loop
      insert into public.contact_discovery_sessions(
        organisation_id,campaign_id,company_id,status,stage,progress,next_attempt_at
      ) values(
        v_company.organisation_id,v_company.campaign_id,v_company.id,
        'QUEUED','PREPARING',0,now()
      ) on conflict (organisation_id,campaign_id,company_id) do nothing;
      get diagnostics v_count=row_count;
      v_contact_created:=v_contact_created+v_count;
    end loop;

    -- A company rejected after queueing cannot leave an unclaimed job behind.
    update public.contact_discovery_sessions cs
    set status='CANCELLED',stage='PREPARING',progress=0,
        next_attempt_at=null,lease_expires_at=null,
        last_error='COMPANY_NO_LONGER_APPROVED',updated_at=now()
    where cs.organisation_id=v_campaign.organisation_id
      and cs.campaign_id=v_campaign.id
      and cs.status in ('QUEUED','FAILED')
      and not exists(
        select 1 from public.companies co
        where co.id=cs.company_id
          and co.organisation_id=cs.organisation_id
          and co.campaign_id=cs.campaign_id
          and co.review_status='APPROVED'
      );

    -- Outreach readiness is also scheduler-owned. It is descriptive only; G4
    -- will later consume the persisted hand-off event.
    select count(*) filter (where review_status='PENDING_REVIEW'),
           count(*) filter (where review_status='APPROVED')
    into v_pending_contacts,v_approved_contacts
    from public.contacts
    where organisation_id=v_campaign.organisation_id
      and campaign_id=v_campaign.id;

    select count(*) into v_active_contact_jobs
    from public.contact_discovery_sessions
    where organisation_id=v_campaign.organisation_id
      and campaign_id=v_campaign.id
      and (
        status in ('QUEUED','RUNNING')
        or (status='FAILED' and next_attempt_at is not null)
      );

    if v_approved_contacts>0
       and v_pending_contacts=0
       and v_active_contact_jobs=0
       and not exists(
         select 1 from public.campaign_timeline
         where organisation_id=v_campaign.organisation_id
           and campaign_id=v_campaign.id
           and event_type='CONTACTS_READY_FOR_OUTREACH'
       ) then
      insert into public.campaign_timeline(
        organisation_id,campaign_id,event_type,title,description,visibility,metadata_json
      ) values(
        v_campaign.organisation_id,v_campaign.id,'CONTACTS_READY_FOR_OUTREACH',
        'Contacts ready for outreach',
        v_approved_contacts||' approved contact'||case when v_approved_contacts=1 then ' is' else 's are' end||' ready for the Outreach stage.',
        'CUSTOMER',jsonb_build_object('approvedContactCount',v_approved_contacts)
      );

      v_event_id:=gen_random_uuid();
      insert into public.domain_outbox(
        organisation_id,event_id,event_type,aggregate_type,aggregate_id,payload_json,occurred_at
      ) values(
        v_campaign.organisation_id,v_event_id,'CampaignContactsReadyForOutreach',
        'Campaign',v_campaign.id,
        jsonb_build_object('campaignId',v_campaign.id,'approvedContactCount',v_approved_contacts),now()
      );
    end if;
  end loop;

  v_preparation:=jsonb_build_object(
    'campaignsInspected',v_campaigns,
    'companyJobsCreated',v_company_created,
    'companyTopUpsQueued',v_company_topups,
    'contactJobsCreated',v_contact_created,
    'expiredCompanyLeasesRecovered',v_company_recovered,
    'expiredContactLeasesRecovered',v_contact_recovered
  );

  update public.pipeline_scheduler_runs
  set preparation_json=v_preparation
  where id=p_run_id;

  return query select v_campaigns,v_company_created,v_company_topups,v_contact_created,
                      v_company_recovered,v_contact_recovered;
exception when others then
  update public.pipeline_scheduler_runs
  set status='FAILED',completed_at=now(),last_error=left(sqlerrm,1000)
  where id=p_run_id;
  raise;
end $$;

revoke all on function public.prepare_pipeline_work(uuid) from public,anon,authenticated;
grant execute on function public.prepare_pipeline_work(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Repair state left by legacy competing orchestration.
-- ---------------------------------------------------------------------------

-- Running rows without a live lease are not active work.
update public.discovery_sessions
set status='FAILED',stage='PREPARING',progress=0,
    last_error=coalesce(last_error,'STABILISATION_RECOVERED_STRANDED_JOB'),
    next_attempt_at=coalesce(next_attempt_at,now()),lease_expires_at=null,
    heartbeat_at=now(),updated_at=now()
where status='RUNNING'
  and (lease_expires_at is null or lease_expires_at<=now());

update public.contact_discovery_sessions
set status='FAILED',stage='PREPARING',progress=0,result_status='FAILED',
    last_error=coalesce(last_error,'STABILISATION_RECOVERED_STRANDED_JOB'),
    next_attempt_at=coalesce(next_attempt_at,now()),lease_expires_at=null,
    heartbeat_at=now(),updated_at=now()
where status='RUNNING'
  and (lease_expires_at is null or lease_expires_at<=now());

-- Remove duplicate customer-facing top-up noise while preserving the newest
-- event for each actual persisted cycle.
with ranked as (
  select id,row_number() over(
    partition by organisation_id,campaign_id,event_type,coalesce(metadata_json->>'cycleNumber','legacy')
    order by occurred_at desc,id desc
  ) as rn
  from public.campaign_timeline
  where event_type='COMPANY_DISCOVERY_TOP_UP_QUEUED'
)
delete from public.campaign_timeline t
using ranked r
where t.id=r.id and r.rn>1;

-- Record the consolidation as an operational audit event.
insert into public.pipeline_scheduler_runs(id,owner,status,started_at,completed_at,preparation_json)
values(
  gen_random_uuid(),'migration:0022','COMPLETED',now(),now(),
  jsonb_build_object(
    'release','S4',
    'legacyTriggersRemoved',5,
    'workCreationOwner','PIPELINE_SCHEDULER'
  )
);

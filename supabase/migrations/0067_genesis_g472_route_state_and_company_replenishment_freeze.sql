-- Genesis G4.7.2: Route Intelligence state-contract + company replenishment freeze.
-- 1) Evolves the historical G3 contact discovery stage constraint to permit the
--    G4 Route Intelligence EXPANDING state used by the readiness evaluator.
-- 2) Replenishes Company Discovery only after the current review batch is fully
--    cleared. Route Intelligence may continue in parallel; approved companies
--    are never returned to Company Review.

-- The original constraint was created inline in 0011. Replace it explicitly so
-- the database contract matches the current Route Intelligence state machine.
alter table public.contact_discovery_sessions
  drop constraint if exists contact_discovery_sessions_stage_check;

alter table public.contact_discovery_sessions
  add constraint contact_discovery_sessions_stage_check
  check (stage in ('PREPARING','RESEARCHING','IDENTIFYING','VALIDATING','SAVING','EXPANDING','COMPLETE'));

-- Recover only sessions that were interrupted by this exact schema-contract bug.
update public.contact_discovery_sessions
set status='QUEUED',
    job_state='QUEUED',
    stage=case when coalesce(route_expansion_pass,0)>0 then 'EXPANDING' else 'PREPARING' end,
    progress=case when coalesce(route_expansion_pass,0)>0 then 45 else 0 end,
    next_attempt_at=now(),
    next_retry_at=now(),
    lease_expires_at=null,
    claimed_at=null,
    last_error=null,
    last_error_code=null,
    last_error_message=null,
    updated_at=now()
where status='FAILED'
  and job_state='FAILED_RETRYABLE'
  and coalesce(route_expansion_pass,0)<4
  and (
    coalesce(last_error_message,'') ilike '%contact_discovery_sessions_stage_check%'
    or coalesce(last_error,'') ilike '%contact_discovery_sessions_stage_check%'
    or coalesce(last_error_message,'') ilike '%violates check constraint%'
  );

-- Scheduler replenishment contract: company batches are discrete human-review
-- units. Do not silently queue more discovery merely because a batch contains
-- fewer than the legacy queue floor. Refill only after PENDING_REVIEW reaches 0.
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
      if v_pending_companies=0
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
            'The current company review batch has been cleared, so MarketRoute scheduled the next evidence-backed discovery cycle while downstream route research can continue in parallel.',
            'CUSTOMER',jsonb_build_object(
              'sessionId',v_session.id,'pendingCount',v_pending_companies,
              'restartTrigger','REVIEW_BATCH_CLEARED',
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
              'pendingCount',v_pending_companies,'restartTrigger','REVIEW_BATCH_CLEARED','queueFloor',v_queue_floor,
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

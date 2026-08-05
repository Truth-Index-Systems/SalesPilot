-- Genesis Stabilisation S2: single bounded pipeline scheduler.
-- Introduces database-backed scheduler ownership and central work preparation.
-- Existing worker implementation and legacy triggers remain intact until S3/S4.

create table if not exists public.pipeline_scheduler_lease (
  singleton boolean primary key default true check (singleton),
  run_id uuid,
  owner text,
  acquired_at timestamptz,
  lease_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.pipeline_scheduler_lease(singleton)
values(true)
on conflict (singleton) do nothing;

create table if not exists public.pipeline_scheduler_runs (
  id uuid primary key,
  owner text not null,
  status text not null check (status in ('RUNNING','COMPLETED','FAILED','EXPIRED')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  preparation_json jsonb,
  last_error text,
  created_at timestamptz not null default now()
);

create index if not exists pipeline_scheduler_runs_started_idx
  on public.pipeline_scheduler_runs(started_at desc);

alter table public.pipeline_scheduler_lease enable row level security;
alter table public.pipeline_scheduler_runs enable row level security;

create or replace function public.acquire_pipeline_scheduler_lease(
  p_owner text,
  p_lease_seconds integer default 240
) returns table(acquired boolean,run_id uuid,lease_expires_at timestamptz)
language plpgsql security definer set search_path=public as $$
declare
  v_run_id uuid:=gen_random_uuid();
  v_expires timestamptz:=now()+make_interval(secs=>greatest(30,least(coalesce(p_lease_seconds,240),600)));
  v_previous_run uuid;
begin
  select l.run_id into v_previous_run
  from public.pipeline_scheduler_lease l
  where l.singleton=true
  for update;

  update public.pipeline_scheduler_runs
  set status='EXPIRED',completed_at=now(),last_error='SCHEDULER_LEASE_EXPIRED'
  where id=v_previous_run and status='RUNNING'
    and exists(
      select 1 from public.pipeline_scheduler_lease l
      where l.singleton=true and (l.lease_expires_at is null or l.lease_expires_at<=now())
    );

  update public.pipeline_scheduler_lease l
  set run_id=v_run_id,owner=left(coalesce(p_owner,'unknown'),300),
      acquired_at=now(),lease_expires_at=v_expires,updated_at=now()
  where l.singleton=true
    and (l.run_id is null or l.lease_expires_at is null or l.lease_expires_at<=now());

  if not found then
    return query select false,null::uuid,l.lease_expires_at
    from public.pipeline_scheduler_lease l where l.singleton=true;
    return;
  end if;

  insert into public.pipeline_scheduler_runs(id,owner,status)
  values(v_run_id,left(coalesce(p_owner,'unknown'),300),'RUNNING');

  return query select true,v_run_id,v_expires;
end $$;

create or replace function public.release_pipeline_scheduler_lease(p_run_id uuid)
returns void
language plpgsql security definer set search_path=public as $$
begin
  update public.pipeline_scheduler_runs
  set status='COMPLETED',completed_at=coalesce(completed_at,now())
  where id=p_run_id and status='RUNNING';

  update public.pipeline_scheduler_lease
  set run_id=null,owner=null,acquired_at=null,lease_expires_at=null,updated_at=now()
  where singleton=true and run_id=p_run_id;
end $$;

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
  v_company public.companies%rowtype;
  v_count integer:=0;
  v_campaigns integer:=0;
  v_company_created integer:=0;
  v_company_topups integer:=0;
  v_contact_created integer:=0;
  v_company_recovered integer:=0;
  v_contact_recovered integer:=0;
  v_preparation jsonb;
begin
  if not exists(
    select 1 from public.pipeline_scheduler_lease
    where singleton=true and run_id=p_run_id and lease_expires_at>now()
  ) then
    raise exception 'PIPELINE_SCHEDULER_LEASE_NOT_HELD';
  end if;

  -- Recovery is centralised here. Claim functions remain atomic executors, but
  -- expired work is made retry-eligible once per scheduler cycle.
  update public.discovery_sessions
  set status='FAILED',stage='PREPARING',progress=0,
      last_error='WORKER_LEASE_EXPIRED',next_attempt_at=now(),
      lease_expires_at=null,updated_at=now()
  where status='RUNNING' and lease_expires_at is not null and lease_expires_at<=now();
  get diagnostics v_company_recovered=row_count;

  update public.contact_discovery_sessions
  set status='FAILED',stage='PREPARING',progress=0,
      result_status='FAILED',last_error='WORKER_LEASE_EXPIRED',next_attempt_at=now(),
      lease_expires_at=null,updated_at=now()
  where status='RUNNING' and lease_expires_at is not null and lease_expires_at<=now();
  get diagnostics v_contact_recovered=row_count;

  for v_campaign in
    select c.* from public.campaigns c
    where c.status in ('PREPARING','READY')
    order by c.created_at
  loop
    v_campaigns:=v_campaigns+1;

    -- Initial company work is created only when the campaign has no aggregate
    -- session. This is idempotent alongside the legacy launch trigger, which is
    -- intentionally removed later in S4.
    insert into public.discovery_sessions(
      organisation_id,campaign_id,status,stage,progress,next_attempt_at,
      cycle_number,cycle_started_at,queue_floor,cycle_baseline_company_count
    )
    select v_campaign.organisation_id,v_campaign.id,'QUEUED','PREPARING',0,now(),
           1,now(),6,0
    where not exists(
      select 1 from public.discovery_sessions s
      where s.organisation_id=v_campaign.organisation_id and s.campaign_id=v_campaign.id
    )
    on conflict (organisation_id,campaign_id) do nothing;
    get diagnostics v_count=row_count;
    v_company_created:=v_company_created+v_count;

    -- Top-up evaluation is no longer a broad pre-worker cron sweep. The
    -- scheduler evaluates each eligible campaign under one lease and the
    -- existing function remains the temporary persistence boundary until S4.
    if exists(
      select 1 from public.discovery_sessions s
      where s.organisation_id=v_campaign.organisation_id
        and s.campaign_id=v_campaign.id
        and s.status='COMPLETED'
    ) and public.ensure_company_review_queue(v_campaign.organisation_id,v_campaign.id) then
      v_company_topups:=v_company_topups+1;
    end if;

    -- Approved companies missing a contact job are made eligible here. The
    -- unique campaign/company constraint keeps this safe while the legacy
    -- approval trigger still exists during the staged migration.
    for v_company in
      select co.* from public.companies co
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

revoke all on function public.acquire_pipeline_scheduler_lease(text,integer) from public,anon,authenticated;
revoke all on function public.release_pipeline_scheduler_lease(uuid) from public,anon,authenticated;
revoke all on function public.prepare_pipeline_work(uuid) from public,anon,authenticated;
grant execute on function public.acquire_pipeline_scheduler_lease(text,integer) to service_role;
grant execute on function public.release_pipeline_scheduler_lease(uuid) to service_role;
grant execute on function public.prepare_pipeline_work(uuid) to service_role;

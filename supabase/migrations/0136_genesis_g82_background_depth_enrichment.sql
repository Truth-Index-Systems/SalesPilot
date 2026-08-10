-- Genesis G8.2 background depth enrichment
-- Preserves all existing company intelligence and queues those exact entity IDs for contact/route depth.

create table if not exists public.genesis_g82_depth_jobs (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null references public.genesis_g82_expansion_targets(id) on delete cascade,
  company_entity_id uuid not null references public.genesis_g8_intelligence_entities(id) on delete cascade,
  canonical_domain text not null,
  status text not null default 'QUEUED' check (status in ('QUEUED','CLAIMED','COMPLETED','FAILED')),
  attempt_count integer not null default 0,
  lease_token uuid,
  lease_expires_at timestamptz,
  worker_id text,
  contacts_persisted integer not null default 0,
  routes_persisted integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(target_id, company_entity_id)
);
create index if not exists genesis_g82_depth_jobs_claim_idx on public.genesis_g82_depth_jobs(status,created_at);
alter table public.genesis_g82_depth_jobs enable row level security;
revoke all on public.genesis_g82_depth_jobs from anon, authenticated;

create or replace function public.ensure_genesis_g82_depth_backlog(p_limit integer default 25)
returns integer language plpgsql security definer set search_path=public as $$
declare v_count integer:=0;
begin
  insert into public.genesis_g82_depth_jobs(target_id,company_entity_id,canonical_domain)
  select m.target_id,m.entity_id,m.canonical_domain
  from public.genesis_g82_expansion_membership m
  join public.genesis_g8_intelligence_entities e on e.id=m.entity_id and e.entity_type='company' and e.status='ACTIVE'
  where m.entity_type='company' and m.canonical_domain is not null
    and not exists(select 1 from public.genesis_g82_depth_jobs j where j.target_id=m.target_id and j.company_entity_id=m.entity_id)
  order by m.created_at asc
  limit greatest(1,least(coalesce(p_limit,25),250))
  on conflict(target_id,company_entity_id) do nothing;
  get diagnostics v_count=row_count;
  return v_count;
end $$;

create or replace function public.claim_genesis_g82_depth_jobs(p_limit integer default 1,p_worker_id text default null,p_lease_seconds integer default 180)
returns table(id uuid,target_id uuid,company_entity_id uuid,canonical_domain text,attempt_count integer,lease_token uuid)
language plpgsql security definer set search_path=public as $$
begin
  return query
  with picked as (
    select j.id from public.genesis_g82_depth_jobs j
    where j.status='QUEUED' or (j.status='CLAIMED' and j.lease_expires_at<now())
    order by j.created_at asc
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,1),4))
  ), upd as (
    update public.genesis_g82_depth_jobs j set status='CLAIMED',attempt_count=j.attempt_count+1,
      lease_token=gen_random_uuid(),lease_expires_at=now()+make_interval(secs=>greatest(60,least(coalesce(p_lease_seconds,180),600))),
      worker_id=p_worker_id,updated_at=now()
    from picked where j.id=picked.id
    returning j.*
  )
  select upd.id,upd.target_id,upd.company_entity_id,upd.canonical_domain,upd.attempt_count,upd.lease_token from upd;
end $$;

create or replace function public.settle_genesis_g82_depth_job(p_job_id uuid,p_lease_token uuid,p_status text,p_contacts_persisted integer default 0,p_routes_persisted integer default 0,p_error text default null)
returns void language plpgsql security definer set search_path=public as $$
begin
  if p_status not in ('QUEUED','COMPLETED','FAILED') then raise exception 'GENESIS_G82_DEPTH_INVALID_STATUS'; end if;
  update public.genesis_g82_depth_jobs set status=p_status,contacts_persisted=greatest(0,coalesce(p_contacts_persisted,0)),routes_persisted=greatest(0,coalesce(p_routes_persisted,0)),
    last_error=p_error,lease_token=null,lease_expires_at=null,worker_id=null,updated_at=now(),completed_at=case when p_status='COMPLETED' then now() else completed_at end
  where id=p_job_id and lease_token=p_lease_token;
  if not found then raise exception 'GENESIS_G82_DEPTH_LEASE_LOST'; end if;
end $$;

grant execute on function public.ensure_genesis_g82_depth_backlog(integer) to service_role;
grant execute on function public.claim_genesis_g82_depth_jobs(integer,text,integer) to service_role;
grant execute on function public.settle_genesis_g82_depth_job(uuid,uuid,text,integer,integer,text) to service_role;
revoke all on function public.ensure_genesis_g82_depth_backlog(integer) from public,anon,authenticated;
revoke all on function public.claim_genesis_g82_depth_jobs(integer,text,integer) from public,anon,authenticated;
revoke all on function public.settle_genesis_g82_depth_job(uuid,uuid,text,integer,integer,text) from public,anon,authenticated;

-- Existing companies are deliberately retained in place. Seed their depth queue immediately.
select public.ensure_genesis_g82_depth_backlog(250);

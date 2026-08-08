-- Genesis G8.1 Release 12 — Knowledge Acquisition from Existing Discovery
-- Existing MarketRoute Discovery Intelligence remains authoritative and unchanged.
-- Lightweight triggers enqueue public-intelligence projection work after existing
-- company/contact/route writes. Customer-private campaign conclusions are never
-- copied into the shared G8 graph.

create table if not exists public.genesis_g8_discovery_acquisition_queue (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('COMPANY','CONTACT','ROUTE')),
  source_id uuid not null,
  status text not null default 'QUEUED' check (status in ('QUEUED','CLAIMED','COMPLETED','FAILED')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz,
  claimed_by text,
  claimed_at timestamptz,
  lease_token text,
  lease_expires_at timestamptz,
  last_error text,
  completed_at timestamptz,
  requeue_requested boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_type,source_id)
);

create index if not exists genesis_g8_acquisition_claimable_idx
  on public.genesis_g8_discovery_acquisition_queue(status,next_attempt_at,lease_expires_at,created_at);

alter table public.genesis_g8_discovery_acquisition_queue enable row level security;
revoke all on public.genesis_g8_discovery_acquisition_queue from public,anon,authenticated;
grant select,insert,update,delete on public.genesis_g8_discovery_acquisition_queue to service_role;

create or replace function public.enqueue_genesis_g8_discovery_acquisition(p_source_type text,p_source_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if p_source_type not in ('COMPANY','CONTACT','ROUTE') then raise exception 'GENESIS_G8_INVALID_ACQUISITION_SOURCE'; end if;
  if p_source_id is null then return; end if;
  insert into public.genesis_g8_discovery_acquisition_queue(source_type,source_id,status,next_attempt_at,last_error,completed_at)
  values(p_source_type,p_source_id,'QUEUED',now(),null,null)
  on conflict(source_type,source_id) do update set
    status=case when genesis_g8_discovery_acquisition_queue.status='CLAIMED' then 'CLAIMED' else 'QUEUED' end,
    requeue_requested=case when genesis_g8_discovery_acquisition_queue.status='CLAIMED' then true else false end,
    next_attempt_at=case when genesis_g8_discovery_acquisition_queue.status='CLAIMED' then genesis_g8_discovery_acquisition_queue.next_attempt_at else now() end,
    last_error=case when genesis_g8_discovery_acquisition_queue.status='CLAIMED' then genesis_g8_discovery_acquisition_queue.last_error else null end,
    completed_at=case when genesis_g8_discovery_acquisition_queue.status='CLAIMED' then genesis_g8_discovery_acquisition_queue.completed_at else null end,
    updated_at=now();
end $$;

create or replace function public.genesis_g8_enqueue_company_row() returns trigger
language plpgsql security definer set search_path=public as $$ begin
  perform public.enqueue_genesis_g8_discovery_acquisition('COMPANY',case when tg_op='DELETE' then old.id else new.id end); if tg_op='DELETE' then return old; end if; return new;
end $$;
create or replace function public.genesis_g8_enqueue_company_evidence_row() returns trigger
language plpgsql security definer set search_path=public as $$ begin
  perform public.enqueue_genesis_g8_discovery_acquisition('COMPANY',case when tg_op='DELETE' then old.company_id else new.company_id end); if tg_op='DELETE' then return old; end if; return new;
end $$;
create or replace function public.genesis_g8_enqueue_contact_row() returns trigger
language plpgsql security definer set search_path=public as $$ begin
  perform public.enqueue_genesis_g8_discovery_acquisition('CONTACT',case when tg_op='DELETE' then old.id else new.id end); if tg_op='DELETE' then return old; end if; return new;
end $$;
create or replace function public.genesis_g8_enqueue_contact_evidence_row() returns trigger
language plpgsql security definer set search_path=public as $$ begin
  perform public.enqueue_genesis_g8_discovery_acquisition('CONTACT',case when tg_op='DELETE' then old.contact_id else new.contact_id end); if tg_op='DELETE' then return old; end if; return new;
end $$;
create or replace function public.genesis_g8_enqueue_route_row() returns trigger
language plpgsql security definer set search_path=public as $$ begin
  perform public.enqueue_genesis_g8_discovery_acquisition('ROUTE',case when tg_op='DELETE' then old.id else new.id end); if tg_op='DELETE' then return old; end if; return new;
end $$;
create or replace function public.genesis_g8_enqueue_route_evidence_row() returns trigger
language plpgsql security definer set search_path=public as $$ begin
  perform public.enqueue_genesis_g8_discovery_acquisition('ROUTE',case when tg_op='DELETE' then old.route_id else new.route_id end); if tg_op='DELETE' then return old; end if; return new;
end $$;

drop trigger if exists genesis_g8_company_acquisition on public.companies;
create trigger genesis_g8_company_acquisition after insert or update on public.companies
for each row execute function public.genesis_g8_enqueue_company_row();
drop trigger if exists genesis_g8_company_evidence_acquisition on public.company_evidence;
create trigger genesis_g8_company_evidence_acquisition after insert or update or delete on public.company_evidence
for each row execute function public.genesis_g8_enqueue_company_evidence_row();
drop trigger if exists genesis_g8_contact_acquisition on public.contacts;
create trigger genesis_g8_contact_acquisition after insert or update on public.contacts
for each row execute function public.genesis_g8_enqueue_contact_row();
drop trigger if exists genesis_g8_contact_evidence_acquisition on public.contact_evidence;
create trigger genesis_g8_contact_evidence_acquisition after insert or update or delete on public.contact_evidence
for each row execute function public.genesis_g8_enqueue_contact_evidence_row();
drop trigger if exists genesis_g8_route_acquisition on public.commercial_routes;
create trigger genesis_g8_route_acquisition after insert or update on public.commercial_routes
for each row execute function public.genesis_g8_enqueue_route_row();
drop trigger if exists genesis_g8_route_evidence_acquisition on public.commercial_route_evidence;
create trigger genesis_g8_route_evidence_acquisition after insert or update or delete on public.commercial_route_evidence
for each row execute function public.genesis_g8_enqueue_route_evidence_row();

create or replace function public.claim_genesis_g8_discovery_acquisitions(
  p_limit integer default 8,p_worker_id text default 'genesis-g8-acquisition',p_lease_seconds integer default 60
) returns table(id uuid,source_type text,source_id uuid,attempt_count integer,lease_token text)
language plpgsql security definer set search_path=public as $$
begin
  return query with candidates as (
    select q.id from public.genesis_g8_discovery_acquisition_queue q
    where q.status in ('QUEUED','CLAIMED') and coalesce(q.next_attempt_at,now())<=now()
      and (q.status='QUEUED' or q.lease_expires_at is null or q.lease_expires_at<now())
    order by q.created_at for update skip locked limit greatest(1,least(coalesce(p_limit,8),20))
  ), claimed as (
    update public.genesis_g8_discovery_acquisition_queue q set status='CLAIMED',claimed_by=left(p_worker_id,240),claimed_at=now(),
      lease_token=gen_random_uuid()::text,lease_expires_at=now()+(greatest(30,least(coalesce(p_lease_seconds,60),180))||' seconds')::interval,
      attempt_count=q.attempt_count+1,updated_at=now() from candidates c where q.id=c.id returning q.*
  ) select c.id,c.source_type,c.source_id,c.attempt_count,c.lease_token from claimed c;
end $$;

create or replace function public.settle_genesis_g8_discovery_acquisition(
  p_id uuid,p_lease_token text,p_status text,p_error text default null
) returns void language plpgsql security definer set search_path=public as $$
declare v_attempt integer;
begin
  if p_status not in ('COMPLETED','QUEUED','FAILED') then raise exception 'GENESIS_G8_INVALID_ACQUISITION_SETTLEMENT'; end if;
  select attempt_count into v_attempt from public.genesis_g8_discovery_acquisition_queue where id=p_id and lease_token=p_lease_token and status='CLAIMED' for update;
  if v_attempt is null then raise exception 'GENESIS_G8_ACQUISITION_LEASE_LOST'; end if;
  update public.genesis_g8_discovery_acquisition_queue set
    status=case when p_status='COMPLETED' and requeue_requested then 'QUEUED' else p_status end,
    completed_at=case when p_status='COMPLETED' and not requeue_requested then now() else null end,
    last_error=left(p_error,2000),
    next_attempt_at=case
      when p_status='COMPLETED' and requeue_requested then now()
      when p_status='QUEUED' then now()+make_interval(secs=>least(300,greatest(10,10*(2^least(v_attempt,4)))))
      else null end,
    requeue_requested=false,claimed_by=null,claimed_at=null,lease_token=null,lease_expires_at=null,updated_at=now() where id=p_id;
end $$;

revoke all on function public.enqueue_genesis_g8_discovery_acquisition(text,uuid) from public,anon,authenticated;
revoke all on function public.claim_genesis_g8_discovery_acquisitions(integer,text,integer) from public,anon,authenticated;
revoke all on function public.settle_genesis_g8_discovery_acquisition(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.enqueue_genesis_g8_discovery_acquisition(text,uuid) to service_role;
grant execute on function public.claim_genesis_g8_discovery_acquisitions(integer,text,integer) to service_role;
grant execute on function public.settle_genesis_g8_discovery_acquisition(uuid,text,text,text) to service_role;

-- Backfill existing public discovery assets without altering their production state.
insert into public.genesis_g8_discovery_acquisition_queue(source_type,source_id,status,next_attempt_at)
select 'COMPANY',id,'QUEUED',now() from public.companies where verification_status='VERIFIED'
on conflict(source_type,source_id) do nothing;
insert into public.genesis_g8_discovery_acquisition_queue(source_type,source_id,status,next_attempt_at)
select 'CONTACT',id,'QUEUED',now() from public.contacts where overall_confidence>0
on conflict(source_type,source_id) do nothing;
insert into public.genesis_g8_discovery_acquisition_queue(source_type,source_id,status,next_attempt_at)
select 'ROUTE',id,'QUEUED',now() from public.commercial_routes where confidence>0
on conflict(source_type,source_id) do nothing;

comment on table public.genesis_g8_discovery_acquisition_queue is 'R12 projection queue: existing tenant-scoped Discovery writes become organisation-neutral public Knowledge Intelligence without modifying the source pipeline.';

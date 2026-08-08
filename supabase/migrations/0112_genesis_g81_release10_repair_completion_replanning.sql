-- Genesis G8.1 Release 10 — Repair Completion & Replanning Loop
-- Durable repair->rehydrate->eligibility->plan cycle with state-fingerprint loop protection.

create table if not exists public.genesis_g8_replan_queue (
  id uuid primary key default gen_random_uuid(),
  source_repair_id uuid not null unique references public.genesis_g8_discovery_repair_queue(id) on delete cascade,
  source_dispatch_key text not null,
  entity_id uuid not null references public.genesis_g8_intelligence_entities(id) on delete cascade,
  entity_type text not null check (entity_type in ('industry','sector','company','contact','route','opportunity')),
  blocking_mode text not null check (blocking_mode in ('NON_BLOCKING','BLOCKING_BEFORE_USE')),
  evidence_found boolean not null default false,
  organisation_id uuid references public.organisations(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  requested_by_user_id uuid,
  status text not null default 'QUEUED' check (status in ('QUEUED','CLAIMED','COMPLETED','FAILED','CANCELLED')),
  outcome text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  lease_token text,
  claimed_by text,
  claimed_at timestamptz,
  lease_expires_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.genesis_g8_replan_cycles (
  id uuid primary key default gen_random_uuid(),
  replan_id uuid not null references public.genesis_g8_replan_queue(id) on delete cascade,
  entity_id uuid not null references public.genesis_g8_intelligence_entities(id) on delete cascade,
  state_fingerprint text not null,
  eligibility_status text not null,
  plan_action text not null,
  truth_index double precision not null check (truth_index between 0 and 100),
  confidence double precision not null check (confidence between 0 and 100),
  coverage double precision not null check (coverage between 0 and 100),
  created_at timestamptz not null default now(),
  unique(entity_id,state_fingerprint)
);

create index if not exists genesis_g8_replan_queue_claim_idx on public.genesis_g8_replan_queue(status,next_attempt_at,created_at);
create index if not exists genesis_g8_replan_cycle_entity_idx on public.genesis_g8_replan_cycles(entity_id,created_at desc);

alter table public.genesis_g8_replan_queue enable row level security;
alter table public.genesis_g8_replan_cycles enable row level security;

create or replace function public.complete_genesis_g8_repair_and_enqueue_replan(
  p_repair_id uuid,
  p_lease_token text,
  p_evidence_found boolean,
  p_requested_by_user_id uuid default null
) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_job public.genesis_g8_discovery_repair_queue%rowtype; v_replan_id uuid;
begin
  select * into v_job from public.genesis_g8_discovery_repair_queue where id=p_repair_id for update;
  if v_job.id is null then raise exception 'GENESIS_G8_REPAIR_NOT_FOUND'; end if;
  if v_job.status <> 'CLAIMED' or v_job.lease_token is distinct from p_lease_token then raise exception 'GENESIS_G8_REPAIR_LEASE_MISMATCH'; end if;

  update public.genesis_g8_discovery_repair_queue
     set status='COMPLETED',completed_at=now(),last_error=case when p_evidence_found then null else 'NO_VERIFIABLE_EVIDENCE_FOUND' end,
         lease_token=null,lease_expires_at=null,updated_at=now()
   where id=p_repair_id;

  insert into public.genesis_g8_replan_queue(
    source_repair_id,source_dispatch_key,entity_id,entity_type,blocking_mode,evidence_found,
    organisation_id,campaign_id,company_id,requested_by_user_id
  ) values (
    v_job.id,v_job.dispatch_key,v_job.entity_id,v_job.entity_type,v_job.blocking_mode,coalesce(p_evidence_found,false),
    v_job.organisation_id,v_job.campaign_id,v_job.company_id,p_requested_by_user_id
  ) on conflict(source_repair_id) do update set
    evidence_found=excluded.evidence_found,updated_at=now()
  returning id into v_replan_id;
  return v_replan_id;
end $$;

create or replace function public.claim_genesis_g8_replans(
  p_limit integer,
  p_worker_id text,
  p_lease_seconds integer default 45
) returns setof public.genesis_g8_replan_queue
language plpgsql security definer set search_path=public as $$
begin
  return query
  with picked as (
    select q.id from public.genesis_g8_replan_queue q
     where (q.status='QUEUED' and q.next_attempt_at<=now())
        or (q.status='CLAIMED' and q.lease_expires_at<now())
     order by q.created_at asc
     for update skip locked
     limit greatest(1,least(coalesce(p_limit,4),8))
  )
  update public.genesis_g8_replan_queue q
     set status='CLAIMED',claimed_by=p_worker_id,claimed_at=now(),lease_token=gen_random_uuid()::text,
         lease_expires_at=now()+make_interval(secs=>greatest(15,least(coalesce(p_lease_seconds,45),180))),
         attempt_count=q.attempt_count+1,updated_at=now()
    from picked where q.id=picked.id
  returning q.*;
end $$;

create or replace function public.register_genesis_g8_replan_cycle(
  p_replan_id uuid,
  p_entity_id uuid,
  p_state_fingerprint text,
  p_eligibility_status text,
  p_plan_action text,
  p_truth_index double precision,
  p_confidence double precision,
  p_coverage double precision
) returns table(id uuid,created boolean)
language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_created boolean:=false;
begin
  insert into public.genesis_g8_replan_cycles(
    replan_id,entity_id,state_fingerprint,eligibility_status,plan_action,truth_index,confidence,coverage
  ) values (
    p_replan_id,p_entity_id,p_state_fingerprint,p_eligibility_status,p_plan_action,p_truth_index,p_confidence,p_coverage
  ) on conflict(entity_id,state_fingerprint) do nothing returning genesis_g8_replan_cycles.id into v_id;
  if v_id is not null then v_created:=true; end if;
  if v_id is null then select c.id into v_id from public.genesis_g8_replan_cycles c where c.entity_id=p_entity_id and c.state_fingerprint=p_state_fingerprint; end if;
  return query select v_id,v_created;
end $$;

create or replace function public.settle_genesis_g8_replan(
  p_replan_id uuid,
  p_lease_token text,
  p_status text,
  p_outcome text default null,
  p_error text default null
) returns void
language plpgsql security definer set search_path=public as $$
declare v_attempt integer;
begin
  if p_status not in ('COMPLETED','QUEUED','FAILED') then raise exception 'GENESIS_G8_INVALID_REPLAN_STATUS'; end if;
  select attempt_count into v_attempt from public.genesis_g8_replan_queue where id=p_replan_id and status='CLAIMED' and lease_token=p_lease_token for update;
  if v_attempt is null then raise exception 'GENESIS_G8_REPLAN_LEASE_MISMATCH'; end if;
  update public.genesis_g8_replan_queue
     set status=p_status,outcome=p_outcome,last_error=left(p_error,2000),
         next_attempt_at=case when p_status='QUEUED' then now()+make_interval(secs=>least(300,15*power(2,greatest(v_attempt-1,0))::integer)) else next_attempt_at end,
         completed_at=case when p_status in ('COMPLETED','FAILED') then now() else completed_at end,
         lease_token=null,lease_expires_at=null,updated_at=now()
   where id=p_replan_id;
end $$;

revoke all on table public.genesis_g8_replan_queue from public,anon,authenticated;
revoke all on table public.genesis_g8_replan_cycles from public,anon,authenticated;
grant all on table public.genesis_g8_replan_queue to service_role;
grant all on table public.genesis_g8_replan_cycles to service_role;

revoke all on function public.complete_genesis_g8_repair_and_enqueue_replan(uuid,text,boolean,uuid) from public,anon,authenticated;
revoke all on function public.claim_genesis_g8_replans(integer,text,integer) from public,anon,authenticated;
revoke all on function public.register_genesis_g8_replan_cycle(uuid,uuid,text,text,text,double precision,double precision,double precision) from public,anon,authenticated;
revoke all on function public.settle_genesis_g8_replan(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.complete_genesis_g8_repair_and_enqueue_replan(uuid,text,boolean,uuid) to service_role;
grant execute on function public.claim_genesis_g8_replans(integer,text,integer) to service_role;
grant execute on function public.register_genesis_g8_replan_cycle(uuid,uuid,text,text,text,double precision,double precision,double precision) to service_role;
grant execute on function public.settle_genesis_g8_replan(uuid,text,text,text,text) to service_role;

comment on table public.genesis_g8_replan_queue is 'R10 durable completion->rehydration->eligibility->planning jobs. A completed repair cannot lose its next decision to a process crash.';
comment on table public.genesis_g8_replan_cycles is 'R10 material-state fingerprints prevent unchanged Truth/gap states from producing unbounded autonomous repair loops.';

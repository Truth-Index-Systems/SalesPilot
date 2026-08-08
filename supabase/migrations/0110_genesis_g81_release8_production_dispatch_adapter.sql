-- Genesis G8.1 Release 8 — Production Dispatch Adapter
-- Durable/idempotent bridge from R7 execution envelopes to existing Discovery
-- Intelligence ownership and the founder-review boundary.

create table if not exists public.genesis_g8_production_dispatches (
  id uuid primary key default gen_random_uuid(),
  dispatch_key text not null unique,
  boundary_version text not null,
  dispatch_version text not null,
  entity_id uuid not null references public.genesis_g8_intelligence_entities(id) on delete cascade,
  instruction_kind text not null check (instruction_kind in ('KNOWLEDGE_RESULT','DISCOVERY_REPAIR','DISCOVERY_FULL','HUMAN_REVIEW')),
  blocking_mode text not null check (blocking_mode in ('NON_BLOCKING','BLOCKING_BEFORE_USE')),
  execution_target text not null,
  workflow_ref text,
  organisation_id uuid references public.organisations(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  payload_json jsonb not null default '{}'::jsonb,
  private_workflow_json jsonb not null default '{}'::jsonb,
  status text not null default 'REGISTERED' check (status in ('REGISTERED','COMPLETED','FAILED')),
  outcome text,
  detail text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.genesis_g8_discovery_repair_queue (
  id uuid primary key default gen_random_uuid(),
  dispatch_key text not null unique references public.genesis_g8_production_dispatches(dispatch_key) on delete cascade,
  entity_id uuid not null references public.genesis_g8_intelligence_entities(id) on delete cascade,
  entity_type text not null check (entity_type in ('industry','sector','company','contact','route','opportunity')),
  claim_id uuid not null references public.genesis_g8_intelligence_claims(id) on delete cascade,
  claim_key text not null,
  repair_mode text not null,
  objective text not null,
  criticality text not null check (criticality in ('CRITICAL','REQUIRED','SUPPORTING','OPTIONAL')),
  minimum_evidence integer not null check (minimum_evidence >= 0),
  additional_evidence_needed integer not null check (additional_evidence_needed >= 0),
  blocking_mode text not null check (blocking_mode in ('NON_BLOCKING','BLOCKING_BEFORE_USE')),
  organisation_id uuid references public.organisations(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  status text not null default 'QUEUED' check (status in ('QUEUED','CLAIMED','COMPLETED','FAILED','CANCELLED')),
  claimed_by text,
  claimed_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.genesis_g8_founder_review_queue (
  id uuid primary key default gen_random_uuid(),
  dispatch_key text not null unique references public.genesis_g8_production_dispatches(dispatch_key) on delete cascade,
  entity_id uuid not null references public.genesis_g8_intelligence_entities(id) on delete cascade,
  entity_type text not null check (entity_type in ('industry','sector','company','contact','route','opportunity')),
  truth_index double precision not null check (truth_index between 0 and 100),
  confidence double precision not null check (confidence between 0 and 100),
  coverage double precision not null check (coverage between 0 and 100),
  reasons_json jsonb not null default '[]'::jsonb,
  claim_keys_json jsonb not null default '[]'::jsonb,
  requested_by_user_id uuid,
  status text not null default 'OPEN' check (status in ('OPEN','RESOLVED','CANCELLED')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists genesis_g8_dispatch_status_idx on public.genesis_g8_production_dispatches(status,created_at);
create index if not exists genesis_g8_repair_queue_status_idx on public.genesis_g8_discovery_repair_queue(status,blocking_mode,created_at);
create index if not exists genesis_g8_founder_review_status_idx on public.genesis_g8_founder_review_queue(status,truth_index,created_at);

alter table public.genesis_g8_production_dispatches enable row level security;
alter table public.genesis_g8_discovery_repair_queue enable row level security;
alter table public.genesis_g8_founder_review_queue enable row level security;

-- Service-role only in R8. A later founder-dashboard release can add a narrow
-- authenticated read policy without exposing shared intelligence to tenants.

create or replace function public.register_genesis_g8_production_dispatch(
  p_dispatch_key text,
  p_boundary_version text,
  p_dispatch_version text,
  p_entity_id uuid,
  p_instruction_kind text,
  p_blocking_mode text,
  p_execution_target text,
  p_workflow_ref text default null,
  p_organisation_id uuid default null,
  p_campaign_id uuid default null,
  p_company_id uuid default null,
  p_payload jsonb default '{}'::jsonb,
  p_private_workflow jsonb default '{}'::jsonb
) returns table(id uuid,status text,outcome text,detail text,created boolean)
language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_status text; v_outcome text; v_detail text; v_created boolean:=false;
begin
  if nullif(trim(coalesce(p_dispatch_key,'')),'') is null then raise exception 'GENESIS_G8_DISPATCH_KEY_REQUIRED'; end if;
  if p_instruction_kind not in ('KNOWLEDGE_RESULT','DISCOVERY_REPAIR','DISCOVERY_FULL','HUMAN_REVIEW') then raise exception 'GENESIS_G8_INVALID_INSTRUCTION_KIND'; end if;
  if p_blocking_mode not in ('NON_BLOCKING','BLOCKING_BEFORE_USE') then raise exception 'GENESIS_G8_INVALID_BLOCKING_MODE'; end if;
  if not exists(select 1 from public.genesis_g8_intelligence_entities where genesis_g8_intelligence_entities.id=p_entity_id) then raise exception 'GENESIS_G8_ENTITY_NOT_FOUND'; end if;

  insert into public.genesis_g8_production_dispatches(
    dispatch_key,boundary_version,dispatch_version,entity_id,instruction_kind,blocking_mode,execution_target,
    workflow_ref,organisation_id,campaign_id,company_id,payload_json,private_workflow_json
  ) values (
    trim(p_dispatch_key),p_boundary_version,p_dispatch_version,p_entity_id,p_instruction_kind,p_blocking_mode,p_execution_target,
    p_workflow_ref,p_organisation_id,p_campaign_id,p_company_id,coalesce(p_payload,'{}'::jsonb),coalesce(p_private_workflow,'{}'::jsonb)
  ) on conflict(dispatch_key) do nothing returning genesis_g8_production_dispatches.id into v_id;

  if v_id is not null then v_created:=true; end if;
  select d.id,d.status,d.outcome,d.detail into v_id,v_status,v_outcome,v_detail
    from public.genesis_g8_production_dispatches d where d.dispatch_key=trim(p_dispatch_key);
  return query select v_id,v_status,v_outcome,v_detail,v_created;
end $$;

create or replace function public.complete_genesis_g8_production_dispatch(
  p_dispatch_key text,
  p_outcome text,
  p_detail text default null
) returns void
language plpgsql security definer set search_path=public as $$
begin
  update public.genesis_g8_production_dispatches
     set status='COMPLETED',outcome=p_outcome,detail=left(p_detail,2000),completed_at=coalesce(completed_at,now()),updated_at=now()
   where dispatch_key=p_dispatch_key;
  if not found then raise exception 'GENESIS_G8_DISPATCH_NOT_FOUND'; end if;
end $$;

create or replace function public.enqueue_genesis_g8_discovery_repair(
  p_dispatch_key text,
  p_entity_id uuid,
  p_entity_type text,
  p_claim_id uuid,
  p_claim_key text,
  p_repair_mode text,
  p_objective text,
  p_criticality text,
  p_minimum_evidence integer,
  p_additional_evidence_needed integer,
  p_blocking_mode text,
  p_organisation_id uuid default null,
  p_campaign_id uuid default null,
  p_company_id uuid default null
) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if not exists(select 1 from public.genesis_g8_production_dispatches where dispatch_key=p_dispatch_key) then raise exception 'GENESIS_G8_DISPATCH_NOT_FOUND'; end if;
  if not exists(select 1 from public.genesis_g8_intelligence_claims where id=p_claim_id and entity_id=p_entity_id) then raise exception 'GENESIS_G8_CLAIM_ENTITY_MISMATCH'; end if;

  insert into public.genesis_g8_discovery_repair_queue(
    dispatch_key,entity_id,entity_type,claim_id,claim_key,repair_mode,objective,criticality,minimum_evidence,
    additional_evidence_needed,blocking_mode,organisation_id,campaign_id,company_id
  ) values (
    p_dispatch_key,p_entity_id,p_entity_type,p_claim_id,p_claim_key,p_repair_mode,p_objective,p_criticality,
    greatest(p_minimum_evidence,0),greatest(p_additional_evidence_needed,0),p_blocking_mode,p_organisation_id,p_campaign_id,p_company_id
  ) on conflict(dispatch_key) do update set updated_at=now()
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.enqueue_genesis_g8_founder_review(
  p_dispatch_key text,
  p_entity_id uuid,
  p_entity_type text,
  p_truth_index double precision,
  p_confidence double precision,
  p_coverage double precision,
  p_reasons jsonb,
  p_claim_keys jsonb,
  p_requested_by_user_id uuid default null
) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if not exists(select 1 from public.genesis_g8_production_dispatches where dispatch_key=p_dispatch_key) then raise exception 'GENESIS_G8_DISPATCH_NOT_FOUND'; end if;
  insert into public.genesis_g8_founder_review_queue(
    dispatch_key,entity_id,entity_type,truth_index,confidence,coverage,reasons_json,claim_keys_json,requested_by_user_id
  ) values (
    p_dispatch_key,p_entity_id,p_entity_type,p_truth_index,p_confidence,p_coverage,coalesce(p_reasons,'[]'::jsonb),coalesce(p_claim_keys,'[]'::jsonb),p_requested_by_user_id
  ) on conflict(dispatch_key) do update set updated_at=now()
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.queue_genesis_g8_full_discovery_via_existing_session(
  p_dispatch_key text,
  p_organisation_id uuid,
  p_campaign_id uuid
) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_session_id uuid; v_status text;
begin
  if not exists(select 1 from public.genesis_g8_production_dispatches where dispatch_key=p_dispatch_key) then raise exception 'GENESIS_G8_DISPATCH_NOT_FOUND'; end if;
  if not exists(select 1 from public.campaigns where id=p_campaign_id and organisation_id=p_organisation_id) then raise exception 'GENESIS_G8_CAMPAIGN_CONTEXT_MISMATCH'; end if;

  select id,status into v_session_id,v_status from public.discovery_sessions
   where organisation_id=p_organisation_id and campaign_id=p_campaign_id for update;

  if v_session_id is null then
    insert into public.discovery_sessions(organisation_id,campaign_id,status,stage,progress)
    values(p_organisation_id,p_campaign_id,'QUEUED','PREPARING',0)
    returning id into v_session_id;
  elsif v_status in ('COMPLETED','FAILED','CANCELLED') then
    update public.discovery_sessions
       set status='QUEUED',stage='PREPARING',progress=0,last_error=null,completed_at=null,updated_at=now()
     where id=v_session_id;
  end if;
  -- RUNNING/QUEUED sessions remain authoritative and are not duplicated/reset.
  return v_session_id;
end $$;

revoke all on table public.genesis_g8_production_dispatches from public,anon,authenticated;
revoke all on table public.genesis_g8_discovery_repair_queue from public,anon,authenticated;
revoke all on table public.genesis_g8_founder_review_queue from public,anon,authenticated;
grant all on table public.genesis_g8_production_dispatches to service_role;
grant all on table public.genesis_g8_discovery_repair_queue to service_role;
grant all on table public.genesis_g8_founder_review_queue to service_role;

revoke all on function public.register_genesis_g8_production_dispatch(text,text,text,uuid,text,text,text,text,uuid,uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.complete_genesis_g8_production_dispatch(text,text,text) from public,anon,authenticated;
revoke all on function public.enqueue_genesis_g8_discovery_repair(text,uuid,text,uuid,text,text,text,text,integer,integer,text,uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.enqueue_genesis_g8_founder_review(text,uuid,text,double precision,double precision,double precision,jsonb,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.queue_genesis_g8_full_discovery_via_existing_session(text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.register_genesis_g8_production_dispatch(text,text,text,uuid,text,text,text,text,uuid,uuid,uuid,jsonb,jsonb) to service_role;
grant execute on function public.complete_genesis_g8_production_dispatch(text,text,text) to service_role;
grant execute on function public.enqueue_genesis_g8_discovery_repair(text,uuid,text,uuid,text,text,text,text,integer,integer,text,uuid,uuid,uuid) to service_role;
grant execute on function public.enqueue_genesis_g8_founder_review(text,uuid,text,double precision,double precision,double precision,jsonb,jsonb,uuid) to service_role;
grant execute on function public.queue_genesis_g8_full_discovery_via_existing_session(text,uuid,uuid) to service_role;

comment on table public.genesis_g8_production_dispatches is 'Idempotent G8 R7->production dispatch ledger. Tenant workflow identifiers are operational routing only and must not be copied into shared intelligence.';
comment on table public.genesis_g8_discovery_repair_queue is 'Exact claim-level repair contracts awaiting explicit consumption by existing Discovery Intelligence workers; R8 never widens these into full-stage research.';
comment on table public.genesis_g8_founder_review_queue is 'Founder review tasks created from deterministic G8 human-review instructions. Review decisions remain separate from Truth Index.';

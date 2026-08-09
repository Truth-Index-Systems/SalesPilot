-- Genesis G8.1 Release 19 — Controlled Production Activation.
create table if not exists public.genesis_g8_activation_control (
  singleton boolean primary key default true check(singleton),
  activation_level integer not null default 0 check(activation_level between 0 and 5),
  allowlist_json jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.genesis_g8_activation_control(singleton,activation_level) values(true,0) on conflict(singleton) do nothing;

create table if not exists public.genesis_g8_activation_events (
  id uuid primary key default gen_random_uuid(),
  activation_version text not null,
  organisation_id uuid references public.organisations(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  configured_level integer not null check(configured_level between 0 and 5),
  effective_level integer not null check(effective_level between 0 and 5),
  decision text not null,
  reason text,
  candidate_count integer not null default 0,
  seeded_count integer not null default 0,
  latency_ms integer not null default 0,
  fallback_used boolean not null default false,
  failed boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists genesis_g8_activation_events_created_idx on public.genesis_g8_activation_events(created_at desc);
create index if not exists genesis_g8_activation_events_campaign_idx on public.genesis_g8_activation_events(campaign_id,created_at desc);

alter table public.genesis_g8_activation_control enable row level security;
alter table public.genesis_g8_activation_events enable row level security;
revoke all on public.genesis_g8_activation_control,public.genesis_g8_activation_events from public,anon,authenticated;
grant select,insert,update on public.genesis_g8_activation_control to service_role;
grant select,insert on public.genesis_g8_activation_events to service_role;

create or replace function public.set_genesis_g8_activation_level(p_level integer) returns integer
language plpgsql security definer set search_path=public as $$
begin
  if p_level<0 or p_level>5 then raise exception 'GENESIS_G8_INVALID_ACTIVATION_LEVEL'; end if;
  insert into public.genesis_g8_activation_control(singleton,activation_level,updated_at) values(true,p_level,now())
  on conflict(singleton) do update set activation_level=excluded.activation_level,updated_at=now();
  return p_level;
end $$;
revoke all on function public.set_genesis_g8_activation_level(integer) from public,anon,authenticated;
grant execute on function public.set_genesis_g8_activation_level(integer) to service_role;

create or replace function public.genesis_g8_activation_runtime_snapshot() returns jsonb
language sql security definer set search_path=public as $$
with cfg as (
 select activation_level,allowlist_json from public.genesis_g8_activation_control where singleton=true
), recent as (
 select * from public.genesis_g8_activation_events where created_at>=now()-interval '24 hours' order by created_at desc limit 100
), recent_entities as (
 select distinct l.genesis_g8_entity_id from public.genesis_g8_campaign_knowledge_links l
 join public.genesis_g8_activation_events a on a.campaign_id=l.campaign_id
 where a.created_at>=now()-interval '24 hours'
), burden as (
 select count(*)::integer c from public.genesis_g8_discovery_repair_queue q where q.entity_id in(select genesis_g8_entity_id from recent_entities) and q.status in('QUEUED','CLAIMED')
), rejected as (
 select count(*)::integer c from public.genesis_g8_intelligence_entities e where e.id in(select genesis_g8_entity_id from recent_entities) and e.review_state='HUMAN_REJECTED'
)
select jsonb_build_object(
 'configured_level',coalesce((select activation_level from cfg),0),
 'allowlist',coalesce((select allowlist_json from cfg),'[]'::jsonb),
 'attempted',(select count(*) from recent),
 'activated',(select count(*) from recent where decision='ACTIVATED'),
 'fallback',(select count(*) from recent where fallback_used),
 'failed',(select count(*) from recent where failed),
 'avg_latency_ms',coalesce((select avg(latency_ms) from recent),0),
 'repair_burden',(select c from burden),
 'rejected_entities',(select c from rejected)
);
$$;
revoke all on function public.genesis_g8_activation_runtime_snapshot() from public,anon,authenticated;
grant execute on function public.genesis_g8_activation_runtime_snapshot() to service_role;

comment on table public.genesis_g8_activation_control is 'R19 founder-controlled production activation level. Default is 0/off; changes require no deployment.';
comment on table public.genesis_g8_activation_events is 'R19 append-only telemetry for controlled Knowledge activation and automatic safety rollback.';

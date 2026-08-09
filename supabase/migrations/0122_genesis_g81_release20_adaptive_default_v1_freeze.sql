-- Genesis G8.1 Release 20 — Adaptive Default / V1 freeze.
-- Knowledge Intelligence becomes the default operating preference, but Discovery
-- remains the universal fallback/enrichment channel. Founder overrides and
-- automatic safety rollback remain authoritative.

alter table public.genesis_g8_activation_control
  add column if not exists system_default_level integer not null default 5 check(system_default_level between 0 and 5),
  add column if not exists founder_override_level integer check(founder_override_level between 0 and 5),
  add column if not exists operating_model text not null default 'ADAPTIVE_DEFAULT',
  add column if not exists g8_v1_frozen_at timestamptz;

-- Preserve deliberate non-zero R19 rollout choices as founder overrides. The
-- untouched R19 default (0/OFF) is promoted to the R20 system default (5).
update public.genesis_g8_activation_control
set
  system_default_level = 5,
  founder_override_level = case
    when activation_level between 1 and 5 then activation_level
    else founder_override_level
  end,
  activation_level = case when activation_level = 0 then 5 else activation_level end,
  operating_model = 'ADAPTIVE_DEFAULT',
  g8_v1_frozen_at = coalesce(g8_v1_frozen_at, now()),
  updated_at = now()
where singleton = true;

insert into public.genesis_g8_activation_control(
  singleton,activation_level,system_default_level,founder_override_level,operating_model,g8_v1_frozen_at
)
values(true,5,5,null,'ADAPTIVE_DEFAULT',now())
on conflict(singleton) do nothing;

create or replace function public.set_genesis_g8_activation_override(p_level integer) returns integer
language plpgsql security definer set search_path=public as $$
begin
  if p_level<0 or p_level>5 then raise exception 'GENESIS_G8_INVALID_ACTIVATION_LEVEL'; end if;
  insert into public.genesis_g8_activation_control(
    singleton,activation_level,system_default_level,founder_override_level,operating_model,g8_v1_frozen_at,updated_at
  ) values(true,p_level,5,p_level,'ADAPTIVE_DEFAULT',now(),now())
  on conflict(singleton) do update set
    activation_level=excluded.activation_level,
    founder_override_level=excluded.founder_override_level,
    operating_model='ADAPTIVE_DEFAULT',
    updated_at=now();
  return p_level;
end $$;
revoke all on function public.set_genesis_g8_activation_override(integer) from public,anon,authenticated;
grant execute on function public.set_genesis_g8_activation_override(integer) to service_role;

create or replace function public.clear_genesis_g8_activation_override() returns integer
language plpgsql security definer set search_path=public as $$
declare v_default integer;
begin
  select system_default_level into v_default from public.genesis_g8_activation_control where singleton=true;
  v_default:=coalesce(v_default,5);
  insert into public.genesis_g8_activation_control(
    singleton,activation_level,system_default_level,founder_override_level,operating_model,g8_v1_frozen_at,updated_at
  ) values(true,v_default,v_default,null,'ADAPTIVE_DEFAULT',now(),now())
  on conflict(singleton) do update set
    activation_level=v_default,
    founder_override_level=null,
    operating_model='ADAPTIVE_DEFAULT',
    updated_at=now();
  return v_default;
end $$;
revoke all on function public.clear_genesis_g8_activation_override() from public,anon,authenticated;
grant execute on function public.clear_genesis_g8_activation_override() to service_role;

-- Backwards-compatible R19 setter now records an explicit founder override.
create or replace function public.set_genesis_g8_activation_level(p_level integer) returns integer
language plpgsql security definer set search_path=public as $$
begin
  return public.set_genesis_g8_activation_override(p_level);
end $$;

create or replace function public.genesis_g8_activation_runtime_snapshot() returns jsonb
language sql security definer set search_path=public as $$
with cfg as (
 select activation_level,system_default_level,founder_override_level,operating_model,allowlist_json,g8_v1_frozen_at
 from public.genesis_g8_activation_control where singleton=true
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
 'configured_level',coalesce((select founder_override_level from cfg),(select system_default_level from cfg),(select activation_level from cfg),0),
 'system_default_level',coalesce((select system_default_level from cfg),5),
 'founder_override_level',(select founder_override_level from cfg),
 'founder_override_active',(select founder_override_level is not null from cfg),
 'operating_model',coalesce((select operating_model from cfg),'ADAPTIVE_DEFAULT'),
 'g8_v1_frozen_at',(select g8_v1_frozen_at from cfg),
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

comment on table public.genesis_g8_activation_control is 'Genesis G8 V1 adaptive-default control. System default is Knowledge-first level 5; founder override and automatic rollback remain authoritative.';
comment on column public.genesis_g8_activation_control.system_default_level is 'R20 system operating preference. Level 5 means adaptive Knowledge-first, not unconditional Knowledge use.';
comment on column public.genesis_g8_activation_control.founder_override_level is 'Optional founder override. Null means use the R20 system default.';
comment on column public.genesis_g8_activation_control.operating_model is 'R20 frozen operating model: ADAPTIVE_DEFAULT = Knowledge first when eligible, Discovery whenever needed.';

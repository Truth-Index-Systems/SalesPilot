-- SalesPilot Genesis G5 — Release 11: Engagement Event Instrumentation
-- Facts now, learning later. This migration adds a separate append-only business
-- event ledger for future Reply Intelligence / learning. It does not alter G4
-- truth, G5 state transitions, scoring, approval, queueing or transport behaviour.

create table if not exists public.engagement_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  strategy_id uuid not null references public.engagement_strategies(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  event_name text not null check (event_name in (
    'MESSAGE_GENERATED','MESSAGE_REWRITTEN','ROUTE_SELECTED','ROUTE_CHANGED',
    'MESSAGE_EDITED','APPROVED','REJECTED','QUEUED','SENT',
    'DELIVERED','BOUNCED','REPLY_RECEIVED'
  )),
  event_key text not null,
  source_kind text not null check (source_kind in ('STRATEGY_EVENT','EXTERNAL')),
  source_strategy_event_id uuid references public.engagement_strategy_events(id) on delete set null,
  provider text,
  provider_event_id text,
  channel_type text,
  route_id uuid,
  actor_type text check (actor_type is null or actor_type in ('AI','HUMAN','SYSTEM','TRANSPORT','RECIPIENT')),
  actor_user_id uuid,
  message_snapshot_json jsonb,
  route_snapshot_json jsonb,
  quality_snapshot_json jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  unique (organisation_id,event_key)
);

create unique index if not exists engagement_events_source_strategy_event_uidx
  on public.engagement_events(source_strategy_event_id)
  where source_strategy_event_id is not null;
create index if not exists engagement_events_strategy_idx
  on public.engagement_events(organisation_id,strategy_id,occurred_at,id);
create index if not exists engagement_events_campaign_idx
  on public.engagement_events(organisation_id,campaign_id,event_name,occurred_at desc);
create index if not exists engagement_events_learning_idx
  on public.engagement_events(event_name,occurred_at desc);

alter table public.engagement_events enable row level security;
drop policy if exists engagement_events_member_read on public.engagement_events;
create policy engagement_events_member_read on public.engagement_events
for select to authenticated using (public.is_active_org_member(organisation_id));

revoke all on table public.engagement_events from public,anon,authenticated;
grant select on table public.engagement_events to authenticated;
grant select,insert on table public.engagement_events to service_role;

-- Project the authoritative G5 state/audit stream into stable commercial facts.
-- This trigger is intentionally read-only with respect to engagement_strategies.
create or replace function public.project_g5_strategy_event_to_engagement_event()
returns trigger
language plpgsql security definer set search_path=public as $$
declare
  s public.engagement_strategies%rowtype;
  v_name text;
  v_actor text;
  v_actor_user uuid;
  v_channel text;
  v_route_text text;
  v_route_id uuid;
  v_message jsonb;
  v_route jsonb;
  v_quality jsonb;
begin
  select * into s from public.engagement_strategies where id=new.strategy_id;
  if s.id is null then return new; end if;

  if new.event_type='CHANNEL_STRATEGY_READY' then
    v_name:='ROUTE_SELECTED'; v_actor:='AI';
  elsif new.event_type='HUMAN_ROUTE_CHANGED' then
    v_name:='ROUTE_CHANGED'; v_actor:='HUMAN';
  elsif new.event_type='HUMAN_EDITED' then
    v_name:='MESSAGE_EDITED'; v_actor:='HUMAN';
  elsif new.event_type='HUMAN_APPROVED' then
    v_name:='APPROVED'; v_actor:='HUMAN';
  elsif new.event_type='HUMAN_REJECTED' then
    v_name:='REJECTED'; v_actor:='HUMAN';
  elsif new.event_type='TRANSITIONED' and new.previous_state='GENERATING' and new.next_state='SELF_REVIEW' then
    if exists (
      select 1 from public.engagement_events e
      where e.strategy_id=new.strategy_id and e.event_name in ('MESSAGE_GENERATED','MESSAGE_REWRITTEN')
    ) then v_name:='MESSAGE_REWRITTEN'; else v_name:='MESSAGE_GENERATED'; end if;
    v_actor:='AI';
  elsif new.event_type='TRANSITIONED' and new.previous_state='APPROVED' and new.next_state='QUEUED' then
    v_name:='QUEUED'; v_actor:='SYSTEM';
  elsif new.event_type='TRANSITIONED' and new.previous_state='QUEUED' and new.next_state='SENT' then
    v_name:='SENT'; v_actor:='TRANSPORT';
  else
    return new;
  end if;

  begin
    v_actor_user:=nullif(new.metadata_json->>'userId','')::uuid;
  exception when invalid_text_representation then
    v_actor_user:=null;
  end;

  v_channel:=coalesce(
    s.human_route_override_json#>>'{primary,executionChannel}',
    s.channel_strategy_json#>>'{primary,executionChannel}',
    s.outreach_generation_json->>'channel',
    new.metadata_json->>'channel'
  );
  v_route_text:=coalesce(
    s.human_route_override_json#>>'{primary,routeId}',
    s.channel_strategy_json#>>'{primary,routeId}',
    new.metadata_json->>'newPrimaryRouteId',
    new.metadata_json->>'routeId'
  );
  begin
    v_route_id:=nullif(v_route_text,'')::uuid;
  exception when invalid_text_representation then
    v_route_id:=null;
  end;

  -- Snapshot only at the moment the new event is emitted. This preserves the facts
  -- that later edits/rewrite cycles would otherwise overwrite on the strategy row.
  if v_name in ('MESSAGE_GENERATED','MESSAGE_REWRITTEN','MESSAGE_EDITED','APPROVED','QUEUED','SENT') then
    v_message:=s.outreach_generation_json;
  end if;
  if v_name in ('ROUTE_SELECTED','ROUTE_CHANGED','MESSAGE_GENERATED','MESSAGE_REWRITTEN','APPROVED','QUEUED','SENT') then
    v_route:=coalesce(s.human_route_override_json,s.channel_strategy_json);
  end if;
  if v_name in ('APPROVED','QUEUED','SENT') then
    v_quality:=s.engagement_quality_json;
  end if;

  insert into public.engagement_events(
    organisation_id,campaign_id,strategy_id,opportunity_id,event_name,event_key,
    source_kind,source_strategy_event_id,channel_type,route_id,actor_type,actor_user_id,
    message_snapshot_json,route_snapshot_json,quality_snapshot_json,metadata_json,occurred_at
  ) values(
    new.organisation_id,new.campaign_id,new.strategy_id,new.opportunity_id,v_name,
    'strategy-event:'||new.id::text,'STRATEGY_EVENT',new.id,v_channel,v_route_id,v_actor,v_actor_user,
    v_message,v_route,v_quality,
    coalesce(new.metadata_json,'{}'::jsonb)||jsonb_build_object('release','G5_R11','strategyEventType',new.event_type,'projected',true),
    new.occurred_at
  ) on conflict (organisation_id,event_key) do nothing;

  return new;
end $$;

-- Backfill existing R3-R10 audit facts. Historical rows intentionally do not get
-- mutable strategy snapshots: only the original audit metadata is projected.
with candidates as (
  select e.*,
    case
      when e.event_type='CHANNEL_STRATEGY_READY' then 'ROUTE_SELECTED'
      when e.event_type='HUMAN_ROUTE_CHANGED' then 'ROUTE_CHANGED'
      when e.event_type='HUMAN_EDITED' then 'MESSAGE_EDITED'
      when e.event_type='HUMAN_APPROVED' then 'APPROVED'
      when e.event_type='HUMAN_REJECTED' then 'REJECTED'
      when e.event_type='TRANSITIONED' and e.previous_state='APPROVED' and e.next_state='QUEUED' then 'QUEUED'
      when e.event_type='TRANSITIONED' and e.previous_state='QUEUED' and e.next_state='SENT' then 'SENT'
      when e.event_type='TRANSITIONED' and e.previous_state='GENERATING' and e.next_state='SELF_REVIEW' then
        case when count(*) filter (where e.event_type='TRANSITIONED' and e.previous_state='GENERATING' and e.next_state='SELF_REVIEW') over (partition by e.strategy_id order by e.occurred_at,e.id rows between unbounded preceding and current row)=1 then 'MESSAGE_GENERATED' else 'MESSAGE_REWRITTEN' end
      else null
    end as projected_name
  from public.engagement_strategy_events e
  where e.event_type in ('CHANNEL_STRATEGY_READY','HUMAN_ROUTE_CHANGED','HUMAN_EDITED','HUMAN_APPROVED','HUMAN_REJECTED','TRANSITIONED')
), mapped as (
  select * from candidates where projected_name is not null
)
insert into public.engagement_events(
  organisation_id,campaign_id,strategy_id,opportunity_id,event_name,event_key,
  source_kind,source_strategy_event_id,channel_type,actor_type,actor_user_id,metadata_json,occurred_at
)
select
  m.organisation_id,m.campaign_id,m.strategy_id,m.opportunity_id,m.projected_name,
  'strategy-event:'||m.id::text,'STRATEGY_EVENT',m.id,m.metadata_json->>'channel',
  case
    when m.projected_name in ('ROUTE_SELECTED','MESSAGE_GENERATED','MESSAGE_REWRITTEN') then 'AI'
    when m.projected_name in ('ROUTE_CHANGED','MESSAGE_EDITED','APPROVED','REJECTED') then 'HUMAN'
    when m.projected_name='QUEUED' then 'SYSTEM'
    when m.projected_name='SENT' then 'TRANSPORT'
    else null end,
  case when (m.metadata_json->>'userId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then (m.metadata_json->>'userId')::uuid else null end,
  coalesce(m.metadata_json,'{}'::jsonb)||jsonb_build_object('release','G5_R11','strategyEventType',m.event_type,'projected',true,'historicalProjection',true),
  m.occurred_at
from mapped m
on conflict (organisation_id,event_key) do nothing;

-- Install projection only after backfill so historical inserts cannot be duplicated.
drop trigger if exists engagement_strategy_events_project_learning on public.engagement_strategy_events;
create trigger engagement_strategy_events_project_learning
after insert on public.engagement_strategy_events
for each row execute function public.project_g5_strategy_event_to_engagement_event();

-- External transport/reply facts are ingestion-only. No interpretation, response
-- generation or deal progression happens here. provider_event_id is mandatory so
-- repeated webhooks are idempotent.
create or replace function public.record_g5_engagement_external_event(
  p_strategy_id uuid,
  p_event_name text,
  p_provider text,
  p_provider_event_id text,
  p_occurred_at timestamptz default now(),
  p_metadata jsonb default '{}'::jsonb
)
returns public.engagement_events
language plpgsql security definer set search_path=public as $$
declare
  s public.engagement_strategies%rowtype;
  q record;
  v_queue_id uuid;
  v_transport_message_id text;
  v public.engagement_events%rowtype;
  v_key text;
  v_actor text;
  v_channel text;
  v_route uuid;
begin
  if p_event_name not in ('DELIVERED','BOUNCED','REPLY_RECEIVED') then
    raise exception 'G5_EXTERNAL_EVENT_TYPE_INVALID';
  end if;
  if nullif(trim(coalesce(p_provider,'')),'') is null or nullif(trim(coalesce(p_provider_event_id,'')),'') is null then
    raise exception 'G5_EXTERNAL_EVENT_ID_REQUIRED';
  end if;

  select * into s from public.engagement_strategies where id=p_strategy_id;
  if s.id is null then raise exception 'G5_ENGAGEMENT_MISSING'; end if;
  if s.state<>'SENT' then raise exception 'G5_EXTERNAL_EVENT_REQUIRES_SENT_ENGAGEMENT'; end if;

  -- R11 must remain deployable even when an environment compiled R9 application
  -- code before applying migration 0082. Avoid a compile-time dependency on the
  -- R9 execution relation; use it when present, otherwise derive the immutable
  -- effective route/channel from the already-SENT strategy snapshot.
  if to_regclass('public.g5_engagement_execution_queue') is not null then
    execute 'select id, channel_type, route_id, transport_message_id from public.g5_engagement_execution_queue where strategy_id=$1 order by created_at desc limit 1'
      into q using s.id;
    if q.id is not null then
      v_queue_id:=q.id;
      v_transport_message_id:=q.transport_message_id;
      v_channel:=q.channel_type;
      v_route:=q.route_id;
    end if;
  end if;

  if v_channel is null then
    v_channel:=coalesce(
      s.human_route_override_json#>>'{primary,executionChannel}',
      s.channel_strategy_json#>>'{primary,executionChannel}'
    );
  end if;
  if v_route is null then
    begin
      v_route:=nullif(coalesce(
        s.human_route_override_json#>>'{primary,routeId}',
        s.channel_strategy_json#>>'{primary,routeId}'
      ),'')::uuid;
    exception when invalid_text_representation then
      v_route:=null;
    end;
  end if;
  if nullif(trim(coalesce(v_channel,'')),'') is null then
    raise exception 'G5_EXTERNAL_EVENT_EXECUTION_CONTEXT_MISSING';
  end if;
  if p_event_name in ('DELIVERED','BOUNCED') and v_channel<>'EMAIL' then
    raise exception 'G5_DELIVERY_EVENT_REQUIRES_EMAIL';
  end if;

  v_key:='external:'||lower(trim(p_provider))||':'||trim(p_provider_event_id);
  select * into v from public.engagement_events where organisation_id=s.organisation_id and event_key=v_key;
  if v.id is not null then return v; end if;

  v_actor:=case when p_event_name='REPLY_RECEIVED' then 'RECIPIENT' else 'TRANSPORT' end;
  insert into public.engagement_events(
    organisation_id,campaign_id,strategy_id,opportunity_id,event_name,event_key,
    source_kind,provider,provider_event_id,channel_type,route_id,actor_type,
    message_snapshot_json,route_snapshot_json,quality_snapshot_json,metadata_json,occurred_at
  ) values(
    s.organisation_id,s.campaign_id,s.id,s.opportunity_id,p_event_name,v_key,
    'EXTERNAL',trim(p_provider),trim(p_provider_event_id),v_channel,v_route,v_actor,
    s.outreach_generation_json,coalesce(s.human_route_override_json,s.channel_strategy_json),s.engagement_quality_json,
    coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object(
      'release','G5_R11','queueId',v_queue_id,'transportMessageId',v_transport_message_id,
      'recordOnly',true,'replyInterpretation',false,'learningApplied',false
    ),coalesce(p_occurred_at,now())
  )
  on conflict (organisation_id,event_key) do nothing
  returning * into v;
  if v.id is null then
    select * into v from public.engagement_events where organisation_id=s.organisation_id and event_key=v_key;
  end if;
  return v;
end $$;

revoke all on function public.record_g5_engagement_external_event(uuid,text,text,text,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.record_g5_engagement_external_event(uuid,text,text,text,timestamptz,jsonb) to service_role;

-- Explicitly keep the ledger append-only for runtime roles.
revoke update,delete,truncate on table public.engagement_events from service_role,authenticated,anon,public;

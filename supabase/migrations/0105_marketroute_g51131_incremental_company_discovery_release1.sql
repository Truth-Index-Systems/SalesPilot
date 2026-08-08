-- MarketRoute G5.1.13.1 — Incremental Company Discovery, Release 1.
-- Surface breadth-search candidates as a durable staging layer before the existing
-- evidence gate. Canonical companies remain verification-only.

alter table public.discovery_sessions
  drop constraint if exists discovery_sessions_stage_check;

alter table public.discovery_sessions
  add constraint discovery_sessions_stage_check check(stage in(
    'PREPARING','PLANNING','SEARCH_PLAN_RUNNING','SEARCH_PLAN_READY',
    'BREADTH_DISCOVERY','DISCOVERY_BATCH_READY','SEARCHING','VERIFYING',
    'VALIDATING','SAVING','ANALYSING','EXPANDING','READY','COMPLETE',
    'TECHNICAL_RETRY','NEEDS_ATTENTION'
  ));

create or replace function public.update_company_discovery_progress(
  p_session_id uuid,
  p_stage text,
  p_progress integer,
  p_candidates integer default null
)
returns void language plpgsql security definer set search_path=public as $$
declare
  v_stage text:=upper(coalesce(nullif(trim(p_stage),''),'PREPARING'));
begin
  if v_stage not in (
    'PREPARING','PLANNING','SEARCH_PLAN_RUNNING','SEARCH_PLAN_READY',
    'BREADTH_DISCOVERY','DISCOVERY_BATCH_READY','SEARCHING','VERIFYING',
    'VALIDATING','SAVING','EXPANDING'
  ) then
    raise exception 'invalid discovery running stage: %',v_stage;
  end if;

  update public.discovery_sessions
  set stage=v_stage,
      progress=greatest(coalesce(progress,0),least(95,greatest(0,p_progress))),
      candidates_found=greatest(coalesce(candidates_found,0),coalesce(p_candidates,candidates_found,0)),
      heartbeat_at=now(),
      last_heartbeat_at=now(),
      lease_expires_at=now()+interval '10 minutes',
      updated_at=now()
  where id=p_session_id
    and status='RUNNING'
    and job_state='RUNNING';

  if not found then raise exception 'discovery session is not running'; end if;
end $$;

create table if not exists public.company_discovery_candidates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  discovery_session_id uuid not null references public.discovery_sessions(id) on delete cascade,
  search_pass integer not null check(search_pass >= 1),
  archetype_index integer not null check(archetype_index >= 0),
  company_name text not null,
  website_url text not null,
  canonical_domain text not null,
  industry text,
  country text,
  confidence integer check(confidence between 0 and 100),
  match_label text,
  candidate_status text not null default 'DISCOVERED' check(candidate_status in ('DISCOVERED','VERIFIED','HELD')),
  hold_reason text,
  discovered_at timestamptz not null default now(),
  verified_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(discovery_session_id,search_pass,canonical_domain)
);

create index if not exists company_discovery_candidates_campaign_idx
  on public.company_discovery_candidates(organisation_id,campaign_id,discovered_at desc);
create index if not exists company_discovery_candidates_session_idx
  on public.company_discovery_candidates(discovery_session_id,search_pass,archetype_index,discovered_at desc);

alter table public.company_discovery_candidates enable row level security;
drop policy if exists company_discovery_candidates_member_read on public.company_discovery_candidates;
create policy company_discovery_candidates_member_read on public.company_discovery_candidates
for select to authenticated using (public.is_active_org_member(organisation_id));

create or replace function public.persist_company_discovery_candidate_batch_owned(
  p_session_id uuid,
  p_scheduler_run_id uuid,
  p_search_pass integer,
  p_archetype_index integer,
  p_candidates jsonb
) returns integer
language plpgsql security definer set search_path=public as $$
declare
  s public.discovery_sessions%rowtype;
  item jsonb;
  v_domain text;
  v_saved integer:=0;
begin
  perform public.assert_company_discovery_owner(p_session_id,p_scheduler_run_id,true);
  select * into s from public.discovery_sessions where id=p_session_id for update;
  if s.id is null then raise exception 'discovery session missing'; end if;
  if p_search_pass < 1 then raise exception 'invalid company discovery search pass'; end if;
  if p_archetype_index < 0 then raise exception 'invalid company discovery archetype index'; end if;
  if jsonb_typeof(p_candidates) <> 'array' then raise exception 'company discovery candidate payload must be an array'; end if;

  for item in select * from jsonb_array_elements(p_candidates) loop
    v_domain:=lower(regexp_replace(regexp_replace(coalesce(item->>'websiteUrl',''),'^https?://',''),'[/#?].*$',''));
    v_domain:=regexp_replace(v_domain,'^www\\.','');
    if v_domain='' then continue; end if;

    insert into public.company_discovery_candidates(
      organisation_id,campaign_id,discovery_session_id,search_pass,archetype_index,
      company_name,website_url,canonical_domain,industry,country,confidence,match_label
    ) values(
      s.organisation_id,s.campaign_id,s.id,p_search_pass,p_archetype_index,
      left(coalesce(item->>'name','Unknown company'),180),item->>'websiteUrl',v_domain,
      nullif(item->>'industry',''),nullif(item->>'country',''),
      nullif(item->>'confidence','')::integer,nullif(item->>'matchLabel','')
    )
    on conflict(discovery_session_id,search_pass,canonical_domain) do update set
      company_name=excluded.company_name,
      website_url=excluded.website_url,
      industry=excluded.industry,
      country=excluded.country,
      confidence=excluded.confidence,
      match_label=excluded.match_label,
      updated_at=now();
    v_saved:=v_saved+1;
  end loop;

  update public.discovery_sessions
  set candidates_found=greatest(coalesce(candidates_found,0),(
        select count(*)::integer from public.company_discovery_candidates c
        where c.discovery_session_id=s.id and c.search_pass=p_search_pass
      )),
      stage='DISCOVERY_BATCH_READY',
      progress=greatest(coalesce(progress,0),44),
      heartbeat_at=now(),last_heartbeat_at=now(),updated_at=now()
  where id=s.id;

  return v_saved;
end $$;

create or replace function public.mark_company_discovery_candidate_owned(
  p_session_id uuid,
  p_scheduler_run_id uuid,
  p_search_pass integer,
  p_website_url text,
  p_status text,
  p_hold_reason text default null
) returns boolean
language plpgsql security definer set search_path=public as $$
declare v_domain text; v_status text:=upper(coalesce(p_status,''));
begin
  perform public.assert_company_discovery_owner(p_session_id,p_scheduler_run_id,true);
  if v_status not in ('VERIFIED','HELD') then raise exception 'invalid company discovery candidate status'; end if;
  v_domain:=lower(regexp_replace(regexp_replace(coalesce(p_website_url,''),'^https?://',''),'[/#?].*$',''));
  v_domain:=regexp_replace(v_domain,'^www\\.','');
  if v_domain='' then return false; end if;

  update public.company_discovery_candidates
  set candidate_status=v_status,
      hold_reason=case when v_status='HELD' then left(p_hold_reason,160) else null end,
      verified_at=now(),updated_at=now()
  where discovery_session_id=p_session_id
    and search_pass=p_search_pass
    and canonical_domain=v_domain;
  return found;
end $$;

-- Search-plan persistence is the durable handoff from planning to breadth search.
create or replace function public.persist_company_discovery_search_plan_owned(
  p_session_id uuid,
  p_scheduler_run_id uuid,
  p_search_pass integer,
  p_search_plan jsonb,
  p_archetype_total integer
) returns void
language plpgsql security definer set search_path=public as $$
begin
  perform public.assert_company_discovery_owner(p_session_id,p_scheduler_run_id,true);
  if p_search_pass < 1 then raise exception 'invalid company discovery search pass'; end if;
  if p_archetype_total < 1 or p_archetype_total > 8 then raise exception 'invalid company discovery archetype total'; end if;
  if p_search_plan is null or jsonb_typeof(p_search_plan) <> 'object' then raise exception 'invalid company discovery search plan'; end if;

  update public.discovery_sessions set
    company_search_plan_json=p_search_plan,
    company_search_plan_pass=p_search_pass,
    company_search_archetype_cursor=0,
    company_search_archetype_total=p_archetype_total,
    company_search_cumulative_json='{}'::jsonb,
    company_search_active_result_index=null,
    company_search_active_result_json=null,
    stage='SEARCH_PLAN_READY',
    progress=greatest(coalesce(progress,0),34),
    heartbeat_at=now(),last_heartbeat_at=now(),updated_at=now()
  where id=p_session_id;
end $$;

revoke all on table public.company_discovery_candidates from anon;
revoke all on function public.persist_company_discovery_candidate_batch_owned(uuid,uuid,integer,integer,jsonb) from public,anon,authenticated;
revoke all on function public.mark_company_discovery_candidate_owned(uuid,uuid,integer,text,text,text) from public,anon,authenticated;
grant execute on function public.persist_company_discovery_candidate_batch_owned(uuid,uuid,integer,integer,jsonb) to service_role;
grant execute on function public.mark_company_discovery_candidate_owned(uuid,uuid,integer,text,text,text) to service_role;
grant select on table public.company_discovery_candidates to authenticated;

alter table public.discovery_sessions
  add column if not exists heartbeat_at timestamptz,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists next_attempt_at timestamptz;

create index if not exists discovery_sessions_claim_idx
  on public.discovery_sessions(status, next_attempt_at, created_at);

create or replace function public.claim_company_discovery()
returns table(session_id uuid, organisation_id uuid, campaign_id uuid)
language plpgsql security definer set search_path=public as $$
declare claimed uuid;
begin
  update public.discovery_sessions
  set status='FAILED',
      stage='PREPARING',
      last_error='WORKER_LEASE_EXPIRED',
      next_attempt_at=now(),
      lease_expires_at=null,
      updated_at=now()
  where status='RUNNING'
    and lease_expires_at is not null
    and lease_expires_at < now()
    and attempt_count < 3;

  select id into claimed
  from public.discovery_sessions
  where status in ('QUEUED','FAILED')
    and attempt_count < 3
    and (next_attempt_at is null or next_attempt_at <= now())
  order by created_at asc
  for update skip locked
  limit 1;

  if claimed is null then return; end if;

  update public.discovery_sessions
  set status='RUNNING',
      stage='SEARCHING',
      progress=greatest(progress,10),
      attempt_count=attempt_count+1,
      started_at=coalesce(started_at,now()),
      heartbeat_at=now(),
      lease_expires_at=now()+interval '10 minutes',
      next_attempt_at=null,
      last_error=null,
      updated_at=now()
  where id=claimed;

  return query
  select s.id,s.organisation_id,s.campaign_id
  from public.discovery_sessions s
  where s.id=claimed;
end $$;

create or replace function public.update_company_discovery_progress(
  p_session_id uuid,
  p_stage text,
  p_progress integer,
  p_candidates integer default null
)
returns void language plpgsql security definer set search_path=public as $$
begin
  if p_stage not in ('PREPARING','SEARCHING','ANALYSING','VALIDATING','SAVING','COMPLETE') then
    raise exception 'invalid discovery stage';
  end if;

  update public.discovery_sessions
  set stage=p_stage,
      progress=greatest(progress,least(95,greatest(0,p_progress))),
      candidates_found=coalesce(p_candidates,candidates_found),
      heartbeat_at=now(),
      lease_expires_at=now()+interval '10 minutes',
      updated_at=now()
  where id=p_session_id and status='RUNNING';
end $$;

create or replace function public.complete_company_discovery(p_session_id uuid,p_companies jsonb)
returns integer language plpgsql security definer set search_path=public as $$
declare
  s public.discovery_sessions%rowtype;
  item jsonb;
  v_company_id uuid;
  saved integer:=0;
  ev jsonb;
  domain text;
  next_version integer;
begin
  select * into s from public.discovery_sessions where id=p_session_id for update;
  if s.id is null then raise exception 'discovery session missing'; end if;
  if s.status='COMPLETED' then return s.recommendations_saved; end if;
  if s.status<>'RUNNING' then raise exception 'discovery session is not running'; end if;
  if jsonb_typeof(p_companies)<>'array' or jsonb_array_length(p_companies)=0 then raise exception 'companies payload is empty'; end if;

  for item in select * from jsonb_array_elements(p_companies) loop
    domain:=lower(regexp_replace(regexp_replace(item->>'websiteUrl','^https?://',''),'[/#?].*$',''));
    domain:=regexp_replace(domain,'^www\.','');
    if domain is null or domain='' then continue; end if;

    insert into public.companies(
      organisation_id,campaign_id,discovery_session_id,company_name,website_url,
      canonical_domain,country,industry,summary,confidence,match_label
    ) values(
      s.organisation_id,s.campaign_id,s.id,item->>'name',item->>'websiteUrl',domain,
      nullif(item->>'country',''),nullif(item->>'industry',''),item->>'summary',
      (item->>'confidence')::integer,item->>'matchLabel'
    )
    on conflict (campaign_id,canonical_domain) do update
    set company_name=excluded.company_name,
        website_url=excluded.website_url,
        country=excluded.country,
        industry=excluded.industry,
        summary=excluded.summary,
        confidence=excluded.confidence,
        match_label=excluded.match_label,
        discovery_session_id=excluded.discovery_session_id,
        updated_at=now()
    returning id into v_company_id;

    select coalesce(max(version_number),0)+1 into next_version
    from public.company_versions where company_id=v_company_id;

    insert into public.company_versions(organisation_id,company_id,version_number,payload_json)
    values(s.organisation_id,v_company_id,next_version,item);

    delete from public.company_evidence where company_id=v_company_id;
    for ev in select * from jsonb_array_elements(coalesce(item->'evidence','[]'::jsonb)) loop
      insert into public.company_evidence(organisation_id,company_id,claim,source_url,excerpt,source_title)
      values(s.organisation_id,v_company_id,ev->>'claim',ev->>'sourceUrl',nullif(ev->>'excerpt',''),nullif(ev->>'sourceTitle',''));
    end loop;
    saved:=saved+1;
  end loop;

  update public.discovery_sessions
  set status='COMPLETED',stage='COMPLETE',progress=100,recommendations_saved=saved,
      completed_at=now(),heartbeat_at=now(),lease_expires_at=null,next_attempt_at=null,updated_at=now()
  where id=s.id;

  update public.campaigns set status='READY',updated_at=now() where id=s.campaign_id;

  if not exists (
    select 1 from public.campaign_timeline
    where campaign_id=s.campaign_id and event_type='COMPANY_DISCOVERY_COMPLETED'
  ) then
    insert into public.campaign_timeline(organisation_id,campaign_id,event_type,title,description,visibility,metadata_json)
    values(s.organisation_id,s.campaign_id,'COMPANY_DISCOVERY_COMPLETED','Companies ready for review',saved||' matching companies are ready for your review.','CUSTOMER',jsonb_build_object('companyCount',saved));
  end if;

  return saved;
end $$;

create or replace function public.fail_company_discovery(p_session_id uuid,p_error text)
returns void language plpgsql security definer set search_path=public as $$
declare attempts integer;
begin
  select attempt_count into attempts from public.discovery_sessions where id=p_session_id;
  update public.discovery_sessions
  set status='FAILED',
      stage='PREPARING',
      last_error=left(coalesce(p_error,'COMPANY_DISCOVERY_FAILED'),1000),
      next_attempt_at=case when attempts < 3 then now() + make_interval(mins => greatest(1,power(2,greatest(0,attempts-1))::integer)) else null end,
      heartbeat_at=now(),
      lease_expires_at=null,
      updated_at=now()
  where id=p_session_id;
end $$;

create or replace function public.retry_company_discovery(p_campaign_id uuid,p_organisation_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  update public.discovery_sessions
  set status='QUEUED',stage='PREPARING',progress=0,candidates_found=0,recommendations_saved=0,
      attempt_count=0,last_error=null,next_attempt_at=null,heartbeat_at=null,lease_expires_at=null,
      started_at=null,completed_at=null,updated_at=now()
  where campaign_id=p_campaign_id and organisation_id=p_organisation_id and status='FAILED';
  return found;
end $$;

revoke all on function public.retry_company_discovery(uuid,uuid) from public,anon,authenticated;
grant execute on function public.retry_company_discovery(uuid,uuid) to service_role;

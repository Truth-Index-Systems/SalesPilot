create table if not exists public.discovery_activity (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  discovery_session_id uuid not null references public.discovery_sessions(id) on delete cascade,
  activity_type text not null,
  title text not null,
  description text,
  metadata_json jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists discovery_activity_campaign_idx
  on public.discovery_activity(organisation_id,campaign_id,occurred_at desc);

alter table public.discovery_activity enable row level security;
create policy discovery_activity_member_read on public.discovery_activity
for select to authenticated using (public.is_active_org_member(organisation_id));

create or replace function public.record_discovery_activity(
  p_session_id uuid,
  p_activity_type text,
  p_title text,
  p_description text default null,
  p_metadata jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path=public as $$
declare s public.discovery_sessions%rowtype;
begin
  select * into s from public.discovery_sessions where id=p_session_id;
  if s.id is null then raise exception 'discovery session missing'; end if;
  insert into public.discovery_activity(organisation_id,campaign_id,discovery_session_id,activity_type,title,description,metadata_json)
  values(s.organisation_id,s.campaign_id,s.id,left(p_activity_type,80),left(p_title,160),left(p_description,500),coalesce(p_metadata,'{}'::jsonb));
end $$;

create or replace function public.save_company_discovery_batch(p_session_id uuid,p_companies jsonb)
returns integer language plpgsql security definer set search_path=public as $$ 
declare s public.discovery_sessions%rowtype; item jsonb; v_company_id uuid; saved integer:=0; ev jsonb; domain text; next_version integer;
begin
  select * into s from public.discovery_sessions where id=p_session_id for update;
  if s.id is null or s.status<>'RUNNING' then raise exception 'discovery session is not running'; end if;
  if jsonb_typeof(p_companies)<>'array' then raise exception 'companies payload must be an array'; end if;
  for item in select * from jsonb_array_elements(p_companies) loop
    domain:=lower(regexp_replace(regexp_replace(item->>'websiteUrl','^https?://',''),'[/#?].*$',''));
    domain:=regexp_replace(domain,'^www\.','');
    if domain is null or domain='' then continue; end if;
    insert into public.companies(organisation_id,campaign_id,discovery_session_id,company_name,website_url,canonical_domain,country,industry,summary,confidence,match_label)
    values(s.organisation_id,s.campaign_id,s.id,item->>'name',item->>'websiteUrl',domain,nullif(item->>'country',''),nullif(item->>'industry',''),item->>'summary',(item->>'confidence')::integer,item->>'matchLabel')
    on conflict (campaign_id,canonical_domain) do update set company_name=excluded.company_name,website_url=excluded.website_url,country=excluded.country,industry=excluded.industry,summary=excluded.summary,confidence=excluded.confidence,match_label=excluded.match_label,discovery_session_id=excluded.discovery_session_id,updated_at=now()
    returning id into v_company_id;
    select coalesce(max(version_number),0)+1 into next_version from public.company_versions where company_id=v_company_id;
    insert into public.company_versions(organisation_id,company_id,version_number,payload_json) values(s.organisation_id,v_company_id,next_version,item);
    delete from public.company_evidence where company_id=v_company_id;
    for ev in select * from jsonb_array_elements(coalesce(item->'evidence','[]'::jsonb)) loop
      insert into public.company_evidence(organisation_id,company_id,claim,source_url,excerpt,source_title)
      values(s.organisation_id,v_company_id,ev->>'claim',ev->>'sourceUrl',nullif(ev->>'excerpt',''),nullif(ev->>'sourceTitle',''));
    end loop;
    saved:=saved+1;
  end loop;
  update public.discovery_sessions set recommendations_saved=(select count(*) from public.companies where discovery_session_id=s.id),heartbeat_at=now(),lease_expires_at=now()+interval '10 minutes',updated_at=now() where id=s.id;
  return saved;
end $$;

create or replace function public.finalize_company_discovery(p_session_id uuid)
returns integer language plpgsql security definer set search_path=public as $$ 
declare s public.discovery_sessions%rowtype; saved integer;
begin
  select * into s from public.discovery_sessions where id=p_session_id for update;
  if s.id is null then raise exception 'discovery session missing'; end if;
  if s.status='COMPLETED' then return s.recommendations_saved; end if;
  select count(*) into saved from public.companies where discovery_session_id=s.id;
  if saved=0 then raise exception 'no companies saved'; end if;
  update public.discovery_sessions set status='COMPLETED',stage='COMPLETE',progress=100,recommendations_saved=saved,completed_at=now(),heartbeat_at=now(),lease_expires_at=null,next_attempt_at=null,updated_at=now() where id=s.id;
  update public.campaigns set status='READY',updated_at=now() where id=s.campaign_id;
  if not exists(select 1 from public.campaign_timeline where campaign_id=s.campaign_id and event_type='COMPANY_DISCOVERY_COMPLETED') then
    insert into public.campaign_timeline(organisation_id,campaign_id,event_type,title,description,visibility,metadata_json)
    values(s.organisation_id,s.campaign_id,'COMPANY_DISCOVERY_COMPLETED','Companies ready for review',saved||' matching companies are ready for your review.','CUSTOMER',jsonb_build_object('companyCount',saved));
  end if;
  perform public.record_discovery_activity(s.id,'DISCOVERY_COMPLETE','Company recommendations ready',saved||' evidence-backed companies are ready for review.',jsonb_build_object('companyCount',saved));
  return saved;
end $$;

revoke all on function public.record_discovery_activity(uuid,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.save_company_discovery_batch(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.finalize_company_discovery(uuid) from public,anon,authenticated;
grant execute on function public.record_discovery_activity(uuid,text,text,text,jsonb),public.save_company_discovery_batch(uuid,jsonb),public.finalize_company_discovery(uuid) to service_role;

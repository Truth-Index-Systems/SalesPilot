-- Genesis G2.3: independently verified evidence and explainable fit scoring.

alter table public.companies
  add column if not exists evidence_quality integer,
  add column if not exists verification_status text not null default 'LEGACY';

alter table public.companies drop constraint if exists companies_evidence_quality_check;
alter table public.companies add constraint companies_evidence_quality_check
  check (evidence_quality is null or evidence_quality between 0 and 100);
alter table public.companies drop constraint if exists companies_verification_status_check;
alter table public.companies add constraint companies_verification_status_check
  check (verification_status in ('LEGACY','VERIFIED'));

alter table public.company_evidence
  add column if not exists verified boolean not null default false,
  add column if not exists excerpt_matched boolean not null default false,
  add column if not exists source_domain text,
  add column if not exists retrieved_at timestamptz;

create index if not exists companies_org_verification_idx
  on public.companies(organisation_id,verification_status,evidence_quality desc);

create or replace function public.save_company_discovery_batch(p_session_id uuid,p_companies jsonb)
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
  if s.id is null or s.status<>'RUNNING' then raise exception 'discovery session is not running'; end if;
  if jsonb_typeof(p_companies)<>'array' then raise exception 'companies payload must be an array'; end if;

  for item in select * from jsonb_array_elements(p_companies) loop
    if coalesce(item->>'verificationStatus','') <> 'VERIFIED' then continue; end if;
    domain:=lower(regexp_replace(regexp_replace(item->>'websiteUrl','^https?://',''),'[/#?].*$',''));
    domain:=regexp_replace(domain,'^www\.','');
    if domain is null or domain='' then continue; end if;

    insert into public.companies(
      organisation_id,campaign_id,discovery_session_id,company_name,website_url,canonical_domain,
      country,industry,summary,confidence,match_label,evidence_quality,verification_status
    ) values(
      s.organisation_id,s.campaign_id,s.id,item->>'name',item->>'websiteUrl',domain,
      nullif(item->>'country',''),nullif(item->>'industry',''),item->>'summary',
      (item->>'confidence')::integer,item->>'matchLabel',(item->>'evidenceQuality')::integer,'VERIFIED'
    )
    on conflict (campaign_id,canonical_domain) do update set
      company_name=excluded.company_name,
      website_url=excluded.website_url,
      country=excluded.country,
      industry=excluded.industry,
      summary=excluded.summary,
      confidence=excluded.confidence,
      match_label=excluded.match_label,
      evidence_quality=excluded.evidence_quality,
      verification_status='VERIFIED',
      discovery_session_id=excluded.discovery_session_id,
      updated_at=now()
    returning id into v_company_id;

    select coalesce(max(version_number),0)+1 into next_version
    from public.company_versions where company_id=v_company_id;
    insert into public.company_versions(organisation_id,company_id,version_number,payload_json)
    values(s.organisation_id,v_company_id,next_version,item);

    delete from public.company_evidence where company_id=v_company_id;
    for ev in select * from jsonb_array_elements(coalesce(item->'evidence','[]'::jsonb)) loop
      if coalesce((ev->>'verified')::boolean,false)=false then continue; end if;
      insert into public.company_evidence(
        organisation_id,company_id,claim,source_url,excerpt,source_title,
        verified,excerpt_matched,source_domain,retrieved_at
      ) values(
        s.organisation_id,v_company_id,ev->>'claim',ev->>'sourceUrl',
        nullif(ev->>'excerpt',''),nullif(ev->>'sourceTitle',''),true,
        coalesce((ev->>'excerptMatched')::boolean,false),nullif(ev->>'sourceDomain',''),
        nullif(ev->>'retrievedAt','')::timestamptz
      );
    end loop;
    saved:=saved+1;
  end loop;

  update public.discovery_sessions
  set recommendations_saved=(select count(*) from public.companies where discovery_session_id=s.id),
      heartbeat_at=now(),lease_expires_at=now()+interval '10 minutes',updated_at=now()
  where id=s.id;
  return saved;
end $$;

revoke all on function public.save_company_discovery_batch(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_company_discovery_batch(uuid,jsonb) to service_role;

drop view if exists public.company_detail;
drop view if exists public.company_overview;

create view public.company_overview with (security_invoker = true) as
select c.*,ca.name as campaign_name,
 (select count(*) from public.company_evidence e where e.company_id=c.id and e.verified=true) as evidence_count
from public.companies c join public.campaigns ca on ca.id=c.campaign_id;

create view public.company_detail with (security_invoker = true) as
select c.*,ca.name as campaign_name,
 coalesce((select jsonb_agg(jsonb_build_object(
   'id',e.id,'claim',e.claim,'source_url',e.source_url,'excerpt',e.excerpt,
   'source_title',e.source_title,'verified',e.verified,'excerpt_matched',e.excerpt_matched,
   'source_domain',e.source_domain,'retrieved_at',e.retrieved_at,'created_at',e.created_at
 ) order by e.created_at) from public.company_evidence e where e.company_id=c.id),'[]'::jsonb) as evidence,
 coalesce((select v.payload_json from public.company_versions v where v.company_id=c.id order by version_number desc limit 1),'{}'::jsonb) as payload
from public.companies c join public.campaigns ca on ca.id=c.campaign_id;

-- Genesis G8.1 Release 15 — Knowledge + Discovery Merge Engine.
-- Seeds only already-usable shared Knowledge candidates into the tenant campaign
-- company universe. Existing Discovery Intelligence remains authoritative and
-- continues independently. Canonical-domain uniqueness performs deduplication.

create table if not exists public.genesis_g8_campaign_knowledge_links (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  genesis_g8_entity_id uuid not null references public.genesis_g8_intelligence_entities(id) on delete restrict,
  merge_version text not null,
  business_fit double precision not null default 0 check (business_fit between 0 and 100),
  retrieval_score double precision not null default 0 check (retrieval_score between 0 and 100),
  created_at timestamptz not null default now(),
  unique(campaign_id,genesis_g8_entity_id),
  unique(campaign_id,company_id)
);
create index if not exists genesis_g8_campaign_links_campaign_idx on public.genesis_g8_campaign_knowledge_links(organisation_id,campaign_id,created_at desc);
alter table public.genesis_g8_campaign_knowledge_links enable row level security;
revoke all on public.genesis_g8_campaign_knowledge_links from public,anon,authenticated;
grant select,insert,update on public.genesis_g8_campaign_knowledge_links to service_role;

create or replace function public.merge_genesis_g8_knowledge_candidates_into_campaign(
  p_organisation_id uuid,
  p_campaign_id uuid,
  p_merge_version text,
  p_candidates jsonb
) returns table(seeded_count integer)
language plpgsql security definer set search_path=public as $$
declare
  v_session_id uuid;
  v_count integer:=0;
  item jsonb;
  p public.genesis_g8_company_search_projection%rowtype;
  v_company_id uuid;
  v_domain text;
  v_industry text;
  v_country text;
  v_summary text;
  v_conf integer;
  v_fit double precision;
  v_retrieval double precision;
  ev record;
  v_next_version integer;
begin
  if not exists(select 1 from public.campaigns c where c.id=p_campaign_id and c.organisation_id=p_organisation_id) then
    raise exception 'campaign ownership mismatch';
  end if;
  if jsonb_typeof(coalesce(p_candidates,'[]'::jsonb))<>'array' then raise exception 'candidates must be array'; end if;

  insert into public.discovery_sessions(organisation_id,campaign_id,status,stage,progress)
  values(p_organisation_id,p_campaign_id,'QUEUED','PREPARING',0)
  on conflict(organisation_id,campaign_id) do nothing;
  select id into v_session_id from public.discovery_sessions where organisation_id=p_organisation_id and campaign_id=p_campaign_id limit 1;
  if v_session_id is null then raise exception 'discovery session unavailable'; end if;

  for item in select * from jsonb_array_elements(p_candidates) limit 25 loop
    select * into p from public.genesis_g8_company_search_projection
      where entity_id=(item->>'entityId')::uuid and status='ACTIVE' and review_state<>'HUMAN_REJECTED'
      and truth_index>=60 and confidence>=55 and coverage>=20;
    if not found then continue; end if;
    v_domain:=lower(regexp_replace(regexp_replace(coalesce(p.canonical_key,''),'^https?://',''),'[/#?].*$',''));
    v_domain:=regexp_replace(v_domain,'^www\\.','');
    if v_domain='' then continue; end if;
    v_fit:=greatest(0,least(100,coalesce((item->>'businessFit')::double precision,0)));
    v_retrieval:=greatest(0,least(100,coalesce((item->>'retrievalScore')::double precision,0)));
    -- Server-side floor prevents a tampered client shortlist from admitting poor matches.
    if v_fit<30 or v_retrieval<45 then continue; end if;
    v_industry:=nullif(coalesce(p.claim_text_json->>'industry',p.claim_text_json->>'sector'),'');
    v_country:=nullif(p.claim_text_json->>'geography','');
    v_summary:=left(concat_ws(' · ',nullif(p.claim_text_json->>'offering',''),nullif(p.claim_text_json->>'customer_market',''),nullif(p.claim_text_json->>'commercial_problems','')),1000);
    if coalesce(v_summary,'')='' then v_summary:='Existing evidence-backed Genesis Knowledge Intelligence candidate.'; end if;
    v_conf:=greatest(0,least(100,round(least(p.truth_index,p.confidence))::integer));

    insert into public.companies(organisation_id,campaign_id,discovery_session_id,company_name,website_url,canonical_domain,country,industry,summary,confidence,match_label,commercial_priority_score,commercial_priority_tier,commercial_priority_reasons,commercial_priority_scored_at)
    values(p_organisation_id,p_campaign_id,v_session_id,coalesce(nullif(p.display_name,''),v_domain),'https://'||v_domain,v_domain,v_country,v_industry,v_summary,v_conf,
      case when v_fit>=85 then 'Excellent match' when v_fit>=70 then 'Strong match' else 'Potential match' end,
      round(v_retrieval)::integer,
      case when v_retrieval>=85 then 'A' when v_retrieval>=68 then 'B' else 'C' end,
      jsonb_build_array('Genesis Knowledge Intelligence', 'Business fit '||round(v_fit)::text||'%', 'Truth Index '||round(p.truth_index)::text||'%'),now())
    on conflict(campaign_id,canonical_domain) do update set
      confidence=greatest(public.companies.confidence,excluded.confidence),
      commercial_priority_score=greatest(coalesce(public.companies.commercial_priority_score,0),excluded.commercial_priority_score),
      commercial_priority_tier=case when greatest(coalesce(public.companies.commercial_priority_score,0),excluded.commercial_priority_score)>=85 then 'A' when greatest(coalesce(public.companies.commercial_priority_score,0),excluded.commercial_priority_score)>=68 then 'B' else 'C' end,
      commercial_priority_reasons=public.companies.commercial_priority_reasons || excluded.commercial_priority_reasons,
      updated_at=now()
    returning id into v_company_id;

    insert into public.genesis_g8_campaign_knowledge_links(organisation_id,campaign_id,company_id,genesis_g8_entity_id,merge_version,business_fit,retrieval_score)
    values(p_organisation_id,p_campaign_id,v_company_id,p.entity_id,left(coalesce(p_merge_version,'unknown'),120),v_fit,v_retrieval)
    on conflict(campaign_id,genesis_g8_entity_id) do update set company_id=excluded.company_id,business_fit=excluded.business_fit,retrieval_score=excluded.retrieval_score,merge_version=excluded.merge_version;

    -- Copy public traceable evidence into the tenant company evidence view. Do not copy private customer data.
    for ev in
      select c.label,e.source_ref,e.excerpt,e.source_family
      from public.genesis_g8_intelligence_claims c
      join public.genesis_g8_intelligence_evidence e on e.claim_id=c.id
      where c.entity_id=p.entity_id and coalesce(e.source_ref,'') like 'http%'
      order by e.observed_at desc nulls last,e.created_at desc limit 12
    loop
      if not exists(select 1 from public.company_evidence ce where ce.company_id=v_company_id and ce.source_url=ev.source_ref and ce.claim=ev.label) then
        insert into public.company_evidence(organisation_id,company_id,claim,source_url,excerpt,source_title)
        values(p_organisation_id,v_company_id,left(ev.label,500),ev.source_ref,left(ev.excerpt,2000),left(ev.source_family,300));
      end if;
    end loop;

    select coalesce(max(version_number),0)+1 into v_next_version from public.company_versions where company_id=v_company_id;
    insert into public.company_versions(organisation_id,company_id,version_number,payload_json)
    values(p_organisation_id,v_company_id,v_next_version,jsonb_build_object('source','GENESIS_KNOWLEDGE','g8EntityId',p.entity_id,'businessFit',v_fit,'retrievalScore',v_retrieval,'truthIndex',p.truth_index,'coverage',p.coverage,'mergeVersion',p_merge_version));
    v_count:=v_count+1;
  end loop;

  update public.discovery_sessions set candidates_found=greatest(candidates_found,v_count),updated_at=now() where id=v_session_id;
  if v_count>0 then
    insert into public.discovery_activity(organisation_id,campaign_id,discovery_session_id,activity_type,title,description,metadata_json)
    values(p_organisation_id,p_campaign_id,v_session_id,'KNOWLEDGE_MERGED','Existing intelligence ready',v_count||' evidence-backed companies were available immediately while live discovery continues.',jsonb_build_object('companyCount',v_count,'mergeVersion',p_merge_version));
  end if;
  return query select v_count;
end $$;

revoke all on function public.merge_genesis_g8_knowledge_candidates_into_campaign(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.merge_genesis_g8_knowledge_candidates_into_campaign(uuid,uuid,text,jsonb) to service_role;

comment on table public.genesis_g8_campaign_knowledge_links is 'R15 tenant-private provenance link between a shared Genesis knowledge entity and the campaign company produced from it.';

-- Genesis G8.1 Release 13 — Knowledge Retrieval Matching & Candidate Ranking.
-- Adds a disposable/rebuildable search projection over the evidence-backed G8
-- graph. The projection is not a source of truth and contains no tenant-private
-- Business DNA, campaign reasoning, outreach or opportunity conclusions.

create table if not exists public.genesis_g8_company_search_projection (
  entity_id uuid primary key references public.genesis_g8_intelligence_entities(id) on delete cascade,
  canonical_key text not null,
  display_name text,
  status text not null,
  review_state text not null,
  search_text text not null default '',
  claim_text_json jsonb not null default '{}'::jsonb,
  search_vector tsvector generated always as (to_tsvector('simple', coalesce(search_text,''))) stored,
  truth_index double precision not null default 0,
  confidence double precision not null default 0,
  coverage double precision not null default 0,
  critical_claim_ceiling double precision not null default 0,
  identity_confidence double precision not null default 0,
  contact_count integer not null default 0,
  route_count integer not null default 0,
  contact_truth_score double precision not null default 0,
  route_truth_score double precision not null default 0,
  source_channels text[] not null default '{}'::text[],
  human_reviewed boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists genesis_g8_company_search_vector_idx on public.genesis_g8_company_search_projection using gin(search_vector);
create index if not exists genesis_g8_company_search_truth_idx on public.genesis_g8_company_search_projection(status,review_state,truth_index desc,coverage desc);

alter table public.genesis_g8_company_search_projection enable row level security;
revoke all on public.genesis_g8_company_search_projection from public,anon,authenticated;
grant select,insert,update,delete on public.genesis_g8_company_search_projection to service_role;

create table if not exists public.genesis_g8_knowledge_retrieval_events (
  id uuid primary key default gen_random_uuid(),
  request_fingerprint text not null,
  latency_ms integer not null check (latency_ms >= 0),
  candidates_inspected integer not null default 0,
  candidates_matched integer not null default 0,
  ready_count integer not null default 0,
  ready_with_gaps_count integer not null default 0,
  refresh_required_count integer not null default 0,
  human_review_required_count integer not null default 0,
  discovery_required_count integer not null default 0,
  average_truth_index double precision not null default 0,
  average_coverage double precision not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists genesis_g8_retrieval_events_created_idx on public.genesis_g8_knowledge_retrieval_events(created_at desc);
alter table public.genesis_g8_knowledge_retrieval_events enable row level security;
revoke all on public.genesis_g8_knowledge_retrieval_events from public,anon,authenticated;
grant select,insert on public.genesis_g8_knowledge_retrieval_events to service_role;

create or replace function public.genesis_g8_result_claim_confidence(p_result jsonb,p_claim_key text)
returns double precision language sql immutable parallel safe as $$
  select coalesce((select (item->>'confidence')::double precision
    from jsonb_array_elements(coalesce(p_result->'claims','[]'::jsonb)) item
    where item->>'key'=p_claim_key limit 1),0);
$$;

create or replace function public.refresh_genesis_g8_company_search_projection(p_entity_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare
  v_entity public.genesis_g8_intelligence_entities%rowtype;
  v_claim_text jsonb := '{}'::jsonb;
  v_search_text text := '';
  v_channels text[] := '{}'::text[];
  v_truth double precision := 0;
  v_confidence double precision := 0;
  v_coverage double precision := 0;
  v_ceiling double precision := 0;
  v_identity double precision := 0;
  v_result jsonb := '{}'::jsonb;
  v_contacts integer := 0;
  v_routes integer := 0;
  v_contact_truth double precision := 0;
  v_route_truth double precision := 0;
begin
  select * into v_entity from public.genesis_g8_intelligence_entities where id=p_entity_id;
  if not found then return; end if;
  if v_entity.entity_type <> 'company' then return; end if;

  select coalesce(jsonb_object_agg(x.claim_key,x.claim_text),'{}'::jsonb),
         left(coalesce(string_agg(x.claim_key||' '||x.claim_text,' '),''),30000)
    into v_claim_text,v_search_text
  from (
    select c.claim_key,left(coalesce(string_agg(distinct concat_ws(' ',c.label,e.excerpt,e.source_ref,e.source_family),' '),''),6000) claim_text
    from public.genesis_g8_intelligence_claims c
    left join public.genesis_g8_intelligence_evidence e on e.claim_id=c.id
    where c.entity_id=p_entity_id
    group by c.claim_key
  ) x;

  select coalesce(array_agg(distinct e.intelligence_channel order by e.intelligence_channel)
           filter(where e.intelligence_channel is not null),'{}'::text[])
    into v_channels
  from public.genesis_g8_intelligence_claims c
  join public.genesis_g8_intelligence_evidence e on e.claim_id=c.id
  where c.entity_id=p_entity_id;

  select s.truth_index,s.confidence,s.coverage,s.critical_claim_ceiling,s.result_json
    into v_truth,v_confidence,v_coverage,v_ceiling,v_result
  from public.genesis_g8_truth_snapshots s where s.entity_id=p_entity_id order by s.calculated_at desc limit 1;

  v_truth:=coalesce(v_truth,0); v_confidence:=coalesce(v_confidence,0); v_coverage:=coalesce(v_coverage,0); v_ceiling:=coalesce(v_ceiling,0);
  v_identity:=least(
    public.genesis_g8_result_claim_confidence(v_result,'identity'),
    public.genesis_g8_result_claim_confidence(v_result,'canonical_domain')
  );
  if v_identity=0 then v_identity:=v_ceiling; end if;

  select count(*),coalesce(avg(coalesce(ts.truth_index,0)),0)
    into v_contacts,v_contact_truth
  from public.genesis_g8_intelligence_entities child
  left join lateral (select truth_index from public.genesis_g8_truth_snapshots s where s.entity_id=child.id order by calculated_at desc limit 1) ts on true
  where child.entity_type='contact' and child.status='ACTIVE' and child.review_state<>'HUMAN_REJECTED'
    and child.canonical_key like v_entity.canonical_key||'::person::%';

  select count(*),coalesce(avg(coalesce(ts.truth_index,0)),0)
    into v_routes,v_route_truth
  from public.genesis_g8_intelligence_entities child
  left join lateral (select truth_index from public.genesis_g8_truth_snapshots s where s.entity_id=child.id order by calculated_at desc limit 1) ts on true
  where child.entity_type='route' and child.status='ACTIVE' and child.review_state<>'HUMAN_REJECTED'
    and child.canonical_key like v_entity.canonical_key||'::route::%';

  insert into public.genesis_g8_company_search_projection(
    entity_id,canonical_key,display_name,status,review_state,search_text,claim_text_json,
    truth_index,confidence,coverage,critical_claim_ceiling,identity_confidence,
    contact_count,route_count,contact_truth_score,route_truth_score,source_channels,human_reviewed,updated_at
  ) values (
    v_entity.id,v_entity.canonical_key,v_entity.display_name,v_entity.status,v_entity.review_state,
    left(concat_ws(' ',v_entity.display_name,v_entity.canonical_key,v_search_text),30000),v_claim_text,
    v_truth,v_confidence,v_coverage,v_ceiling,coalesce(v_identity,0),v_contacts,v_routes,v_contact_truth,v_route_truth,
    v_channels,v_entity.review_state in ('HUMAN_APPROVED','HUMAN_CORRECTED','HUMAN_REJECTED'),now()
  ) on conflict(entity_id) do update set
    canonical_key=excluded.canonical_key,display_name=excluded.display_name,status=excluded.status,review_state=excluded.review_state,
    search_text=excluded.search_text,claim_text_json=excluded.claim_text_json,truth_index=excluded.truth_index,confidence=excluded.confidence,
    coverage=excluded.coverage,critical_claim_ceiling=excluded.critical_claim_ceiling,identity_confidence=excluded.identity_confidence,
    contact_count=excluded.contact_count,route_count=excluded.route_count,contact_truth_score=excluded.contact_truth_score,
    route_truth_score=excluded.route_truth_score,source_channels=excluded.source_channels,human_reviewed=excluded.human_reviewed,updated_at=now();
end $$;

create or replace function public.genesis_g8_refresh_company_projection_from_claim() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_entity uuid; v_claim_id uuid;
begin
  v_claim_id:=case when tg_op='DELETE' then old.claim_id else new.claim_id end;
  select entity_id into v_entity from public.genesis_g8_intelligence_claims where id=v_claim_id;
  if v_entity is not null then perform public.refresh_genesis_g8_company_search_projection(v_entity); end if;
  if tg_op='DELETE' then return old; end if; return new;
end $$;

create or replace function public.genesis_g8_refresh_company_projection_from_snapshot() returns trigger
language plpgsql security definer set search_path=public as $$ begin
  perform public.refresh_genesis_g8_company_search_projection(new.entity_id); return new;
end $$;

create or replace function public.genesis_g8_refresh_company_projection_from_entity() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_domain text;
begin
  if new.entity_type='company' then
    perform public.refresh_genesis_g8_company_search_projection(new.id);
  elsif new.entity_type in ('contact','route') then
    v_domain:=split_part(new.canonical_key,'::',1);
    perform public.refresh_genesis_g8_company_search_projection((select id from public.genesis_g8_intelligence_entities where entity_type='company' and canonical_key=v_domain limit 1));
  end if;
  return new;
end $$;

drop trigger if exists genesis_g8_search_projection_evidence on public.genesis_g8_intelligence_evidence;
create trigger genesis_g8_search_projection_evidence after insert or delete on public.genesis_g8_intelligence_evidence
for each row execute function public.genesis_g8_refresh_company_projection_from_claim();
drop trigger if exists genesis_g8_search_projection_truth on public.genesis_g8_truth_snapshots;
create trigger genesis_g8_search_projection_truth after insert on public.genesis_g8_truth_snapshots
for each row execute function public.genesis_g8_refresh_company_projection_from_snapshot();
drop trigger if exists genesis_g8_search_projection_entity on public.genesis_g8_intelligence_entities;
create trigger genesis_g8_search_projection_entity after insert or update of display_name,status,review_state,canonical_key on public.genesis_g8_intelligence_entities
for each row execute function public.genesis_g8_refresh_company_projection_from_entity();

create or replace function public.search_genesis_g8_company_candidates(p_tsquery text default null,p_limit integer default 200)
returns table(
  entity_id uuid,canonical_key text,display_name text,status text,review_state text,search_text text,claim_text_json jsonb,
  truth_index double precision,confidence double precision,coverage double precision,critical_claim_ceiling double precision,
  identity_confidence double precision,contact_count integer,route_count integer,contact_truth_score double precision,
  route_truth_score double precision,source_channels text[],human_reviewed boolean,lexical_rank real,updated_at timestamptz
) language sql stable security definer set search_path=public as $$
  select p.entity_id,p.canonical_key,p.display_name,p.status,p.review_state,p.search_text,p.claim_text_json,
    p.truth_index,p.confidence,p.coverage,p.critical_claim_ceiling,p.identity_confidence,p.contact_count,p.route_count,
    p.contact_truth_score,p.route_truth_score,p.source_channels,p.human_reviewed,
    case when nullif(trim(coalesce(p_tsquery,'')),'') is null then 0::real else ts_rank_cd(p.search_vector,to_tsquery('simple',p_tsquery)) end lexical_rank,
    p.updated_at
  from public.genesis_g8_company_search_projection p
  where p.status='ACTIVE' and p.review_state<>'HUMAN_REJECTED'
    and (nullif(trim(coalesce(p_tsquery,'')),'') is null or p.search_vector @@ to_tsquery('simple',p_tsquery))
  order by lexical_rank desc,p.truth_index desc,p.coverage desc,p.canonical_key asc
  limit greatest(1,least(coalesce(p_limit,200),500));
$$;

create or replace function public.record_genesis_g8_knowledge_retrieval(
  p_request_fingerprint text,p_latency_ms integer,p_candidates_inspected integer,p_candidates_matched integer,
  p_ready_count integer,p_ready_with_gaps_count integer,p_refresh_required_count integer,
  p_human_review_required_count integer,p_discovery_required_count integer,p_average_truth_index double precision,p_average_coverage double precision
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  insert into public.genesis_g8_knowledge_retrieval_events(
    request_fingerprint,latency_ms,candidates_inspected,candidates_matched,ready_count,ready_with_gaps_count,
    refresh_required_count,human_review_required_count,discovery_required_count,average_truth_index,average_coverage
  ) values (
    left(coalesce(p_request_fingerprint,''),128),greatest(0,coalesce(p_latency_ms,0)),greatest(0,coalesce(p_candidates_inspected,0)),
    greatest(0,coalesce(p_candidates_matched,0)),greatest(0,coalesce(p_ready_count,0)),greatest(0,coalesce(p_ready_with_gaps_count,0)),
    greatest(0,coalesce(p_refresh_required_count,0)),greatest(0,coalesce(p_human_review_required_count,0)),greatest(0,coalesce(p_discovery_required_count,0)),
    greatest(0,least(100,coalesce(p_average_truth_index,0))),greatest(0,least(100,coalesce(p_average_coverage,0)))
  ) returning id into v_id;
  return v_id;
end $$;

revoke all on function public.refresh_genesis_g8_company_search_projection(uuid) from public,anon,authenticated;
revoke all on function public.search_genesis_g8_company_candidates(text,integer) from public,anon,authenticated;
revoke all on function public.record_genesis_g8_knowledge_retrieval(text,integer,integer,integer,integer,integer,integer,integer,integer,double precision,double precision) from public,anon,authenticated;
grant execute on function public.refresh_genesis_g8_company_search_projection(uuid) to service_role;
grant execute on function public.search_genesis_g8_company_candidates(text,integer) to service_role;
grant execute on function public.record_genesis_g8_knowledge_retrieval(text,integer,integer,integer,integer,integer,integer,integer,integer,double precision,double precision) to service_role;

-- Rebuildable backfill. This never changes Truth state.
do $$ declare r record; begin
  for r in select id from public.genesis_g8_intelligence_entities where entity_type='company' loop
    perform public.refresh_genesis_g8_company_search_projection(r.id);
  end loop;
end $$;

comment on table public.genesis_g8_company_search_projection is 'R13 rebuildable retrieval projection derived from evidence-backed shared G8 knowledge; never a source of truth.';
comment on table public.genesis_g8_knowledge_retrieval_events is 'R13 privacy-minimised operational retrieval metrics. Business DNA itself is never persisted here.';

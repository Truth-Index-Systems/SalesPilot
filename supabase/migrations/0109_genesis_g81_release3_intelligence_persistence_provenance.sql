-- Genesis G8.1 Release 3 — Intelligence Persistence & Provenance Foundation.
-- Adds an organisation-neutral shared intelligence store for public commercial
-- knowledge. No existing Discovery Intelligence table or production route is
-- modified. Customer-private campaign data remains outside this domain.

create table if not exists public.genesis_g8_intelligence_entities (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('industry','sector','company','contact','route','opportunity')),
  canonical_key text not null,
  display_name text,
  contract_version text not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','SUPPRESSED','SUPERSEDED')),
  review_state text not null default 'UNREVIEWED' check (review_state in ('UNREVIEWED','NEEDS_REVIEW','HUMAN_APPROVED','HUMAN_CORRECTED','HUMAN_REJECTED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(entity_type, canonical_key)
);

create table if not exists public.genesis_g8_intelligence_claims (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.genesis_g8_intelligence_entities(id) on delete cascade,
  claim_key text not null,
  label text not null,
  criticality text not null check (criticality in ('CRITICAL','REQUIRED','SUPPORTING','OPTIONAL')),
  weight double precision not null check (weight > 0),
  freshness_half_life_days double precision not null check (freshness_half_life_days > 0),
  minimum_evidence integer not null default 1 check (minimum_evidence >= 0),
  counts_toward_coverage boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(entity_id, claim_key)
);

create table if not exists public.genesis_g8_intelligence_evidence (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.genesis_g8_intelligence_claims(id) on delete cascade,
  direction text not null check (direction in ('SUPPORTS','CONTRADICTS')),
  source_class text not null check (source_class in (
    'REGULATORY_OR_GOVERNMENT','OFFICIAL_PRIMARY','OFFICIAL_PROFILE','MAJOR_REPUTABLE_MEDIA',
    'INDUSTRY_PUBLICATION','COMMERCIAL_DATABASE','BUSINESS_DIRECTORY','SOCIAL_OR_COMMUNITY',
    'SEARCH_SNIPPET','UNKNOWN'
  )),
  source_uri text,
  source_ref text,
  source_family text,
  excerpt text,
  strength double precision not null check (strength between 0 and 1),
  traceability double precision not null check (traceability between 0 and 1),
  independence double precision not null check (independence between 0 and 1),
  observed_at timestamptz not null,
  intelligence_channel text not null check (intelligence_channel in ('KNOWLEDGE_INTELLIGENCE','DISCOVERY_INTELLIGENCE')),
  provenance_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.genesis_g8_truth_snapshots (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.genesis_g8_intelligence_entities(id) on delete cascade,
  equation_version text not null,
  contract_version text not null,
  confidence double precision not null check (confidence between 0 and 100),
  coverage double precision not null check (coverage between 0 and 100),
  truth_index double precision not null check (truth_index between 0 and 100),
  critical_claim_ceiling double precision not null check (critical_claim_ceiling between 0 and 100),
  review_required boolean not null,
  review_priority_score double precision not null default 0,
  review_reasons_json jsonb not null default '[]'::jsonb,
  result_json jsonb not null,
  calculated_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.genesis_g8_human_review_receipts (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.genesis_g8_intelligence_entities(id) on delete cascade,
  action text not null check (action in ('APPROVE','CORRECT','REJECT','MORE_RESEARCH')),
  reason_code text,
  note text,
  correction_json jsonb,
  reviewer_user_id uuid,
  truth_snapshot_id uuid references public.genesis_g8_truth_snapshots(id) on delete set null,
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists genesis_g8_entities_type_status_idx on public.genesis_g8_intelligence_entities(entity_type,status,review_state);
create index if not exists genesis_g8_claims_entity_idx on public.genesis_g8_intelligence_claims(entity_id,criticality);
create index if not exists genesis_g8_evidence_claim_observed_idx on public.genesis_g8_intelligence_evidence(claim_id,observed_at desc);
create index if not exists genesis_g8_evidence_channel_idx on public.genesis_g8_intelligence_evidence(intelligence_channel,created_at desc);
create index if not exists genesis_g8_truth_entity_calc_idx on public.genesis_g8_truth_snapshots(entity_id,calculated_at desc);
create index if not exists genesis_g8_truth_review_idx on public.genesis_g8_truth_snapshots(review_required,review_priority_score desc,calculated_at desc);
create index if not exists genesis_g8_review_entity_idx on public.genesis_g8_human_review_receipts(entity_id,reviewed_at desc);

alter table public.genesis_g8_intelligence_entities enable row level security;
alter table public.genesis_g8_intelligence_claims enable row level security;
alter table public.genesis_g8_intelligence_evidence enable row level security;
alter table public.genesis_g8_truth_snapshots enable row level security;
alter table public.genesis_g8_human_review_receipts enable row level security;

-- Shared intelligence is an internal MarketRoute asset. Access remains service-role
-- only until a later release defines safe customer-facing views/read models.
revoke all on public.genesis_g8_intelligence_entities from anon, authenticated;
revoke all on public.genesis_g8_intelligence_claims from anon, authenticated;
revoke all on public.genesis_g8_intelligence_evidence from anon, authenticated;
revoke all on public.genesis_g8_truth_snapshots from anon, authenticated;
revoke all on public.genesis_g8_human_review_receipts from anon, authenticated;

grant select,insert,update,delete on public.genesis_g8_intelligence_entities to service_role;
grant select,insert,update,delete on public.genesis_g8_intelligence_claims to service_role;
grant select,insert,update,delete on public.genesis_g8_intelligence_evidence to service_role;
grant select,insert,update,delete on public.genesis_g8_truth_snapshots to service_role;
grant select,insert,update,delete on public.genesis_g8_human_review_receipts to service_role;

create or replace function public.upsert_genesis_g8_intelligence_entity(
  p_entity_type text,
  p_canonical_key text,
  p_display_name text,
  p_contract_version text
) returns setof public.genesis_g8_intelligence_entities
language plpgsql security definer set search_path=public as $$
begin
  if p_entity_type not in ('industry','sector','company','contact','route','opportunity') then
    raise exception 'GENESIS_G8_INVALID_ENTITY_TYPE';
  end if;
  if nullif(trim(coalesce(p_canonical_key,'')),'') is null then
    raise exception 'GENESIS_G8_CANONICAL_KEY_REQUIRED';
  end if;

  return query
  insert into public.genesis_g8_intelligence_entities(entity_type,canonical_key,display_name,contract_version)
  values (p_entity_type,trim(p_canonical_key),nullif(trim(coalesce(p_display_name,'')),''),p_contract_version)
  on conflict(entity_type,canonical_key) do update set
    display_name=coalesce(excluded.display_name,genesis_g8_intelligence_entities.display_name),
    contract_version=excluded.contract_version,
    updated_at=now()
  returning *;
end $$;

create or replace function public.ensure_genesis_g8_contract_claims(
  p_entity_id uuid,
  p_contract_version text,
  p_claims jsonb
) returns setof public.genesis_g8_intelligence_claims
language plpgsql security definer set search_path=public as $$
declare v_claim jsonb;
begin
  if not exists(select 1 from public.genesis_g8_intelligence_entities where id=p_entity_id) then
    raise exception 'GENESIS_G8_ENTITY_NOT_FOUND';
  end if;
  if jsonb_typeof(coalesce(p_claims,'[]'::jsonb)) <> 'array' then
    raise exception 'GENESIS_G8_CLAIMS_MUST_BE_ARRAY';
  end if;

  update public.genesis_g8_intelligence_entities set contract_version=p_contract_version,updated_at=now() where id=p_entity_id;

  for v_claim in select value from jsonb_array_elements(p_claims)
  loop
    insert into public.genesis_g8_intelligence_claims(
      entity_id,claim_key,label,criticality,weight,freshness_half_life_days,minimum_evidence,counts_toward_coverage
    ) values (
      p_entity_id,
      v_claim->>'key',
      v_claim->>'label',
      v_claim->>'criticality',
      (v_claim->>'weight')::double precision,
      (v_claim->>'freshnessHalfLifeDays')::double precision,
      coalesce((v_claim->>'minimumEvidence')::integer,1),
      coalesce((v_claim->>'countsTowardCoverage')::boolean,true)
    )
    on conflict(entity_id,claim_key) do update set
      label=excluded.label,
      criticality=excluded.criticality,
      weight=excluded.weight,
      freshness_half_life_days=excluded.freshness_half_life_days,
      minimum_evidence=excluded.minimum_evidence,
      counts_toward_coverage=excluded.counts_toward_coverage,
      updated_at=now();
  end loop;

  return query select * from public.genesis_g8_intelligence_claims where entity_id=p_entity_id order by created_at,claim_key;
end $$;

create or replace function public.insert_genesis_g8_evidence(
  p_claim_id uuid,
  p_direction text,
  p_source_class text,
  p_source_uri text,
  p_source_ref text,
  p_source_family text,
  p_excerpt text,
  p_strength double precision,
  p_traceability double precision,
  p_independence double precision,
  p_observed_at timestamptz,
  p_channel text,
  p_provenance jsonb default '{}'::jsonb
) returns setof public.genesis_g8_intelligence_evidence
language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.genesis_g8_intelligence_claims where id=p_claim_id) then raise exception 'GENESIS_G8_CLAIM_NOT_FOUND'; end if;
  if p_direction not in ('SUPPORTS','CONTRADICTS') then raise exception 'GENESIS_G8_INVALID_EVIDENCE_DIRECTION'; end if;
  if p_channel not in ('KNOWLEDGE_INTELLIGENCE','DISCOVERY_INTELLIGENCE') then raise exception 'GENESIS_G8_INVALID_CHANNEL'; end if;
  if p_strength not between 0 and 1 or p_traceability not between 0 and 1 or p_independence not between 0 and 1 then
    raise exception 'GENESIS_G8_EVIDENCE_FACTOR_OUT_OF_RANGE';
  end if;

  return query
  insert into public.genesis_g8_intelligence_evidence(
    claim_id,direction,source_class,source_uri,source_ref,source_family,excerpt,strength,traceability,independence,observed_at,intelligence_channel,provenance_json
  ) values (
    p_claim_id,p_direction,p_source_class,p_source_uri,p_source_ref,p_source_family,p_excerpt,p_strength,p_traceability,p_independence,p_observed_at,p_channel,coalesce(p_provenance,'{}'::jsonb)
  ) returning *;
end $$;

create or replace function public.insert_genesis_g8_truth_snapshot(
  p_entity_id uuid,
  p_contract_version text,
  p_equation_version text,
  p_confidence double precision,
  p_coverage double precision,
  p_truth_index double precision,
  p_critical_claim_ceiling double precision,
  p_review_required boolean,
  p_review_priority_score double precision,
  p_review_reasons jsonb,
  p_result jsonb,
  p_calculated_at timestamptz
) returns setof public.genesis_g8_truth_snapshots
language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.genesis_g8_intelligence_entities where id=p_entity_id) then raise exception 'GENESIS_G8_ENTITY_NOT_FOUND'; end if;
  if p_confidence not between 0 and 100 or p_coverage not between 0 and 100 or p_truth_index not between 0 and 100 or p_critical_claim_ceiling not between 0 and 100 then
    raise exception 'GENESIS_G8_TRUTH_SCORE_OUT_OF_RANGE';
  end if;

  if p_review_required then
    update public.genesis_g8_intelligence_entities
       set review_state=case when review_state in ('HUMAN_APPROVED','HUMAN_CORRECTED','HUMAN_REJECTED') then review_state else 'NEEDS_REVIEW' end,
           updated_at=now()
     where id=p_entity_id;
  end if;

  return query
  insert into public.genesis_g8_truth_snapshots(
    entity_id,equation_version,contract_version,confidence,coverage,truth_index,critical_claim_ceiling,review_required,review_priority_score,review_reasons_json,result_json,calculated_at
  ) values (
    p_entity_id,p_equation_version,p_contract_version,p_confidence,p_coverage,p_truth_index,p_critical_claim_ceiling,p_review_required,p_review_priority_score,coalesce(p_review_reasons,'[]'::jsonb),p_result,p_calculated_at
  ) returning *;
end $$;

create or replace function public.record_genesis_g8_human_review(
  p_entity_id uuid,
  p_action text,
  p_reviewer_user_id uuid default null,
  p_reason_code text default null,
  p_note text default null,
  p_correction jsonb default null,
  p_truth_snapshot_id uuid default null
) returns setof public.genesis_g8_human_review_receipts
language plpgsql security definer set search_path=public as $$
declare v_review_state text; v_status text;
begin
  if p_action not in ('APPROVE','CORRECT','REJECT','MORE_RESEARCH') then raise exception 'GENESIS_G8_INVALID_REVIEW_ACTION'; end if;
  if not exists(select 1 from public.genesis_g8_intelligence_entities where id=p_entity_id) then raise exception 'GENESIS_G8_ENTITY_NOT_FOUND'; end if;

  v_review_state:=case p_action when 'APPROVE' then 'HUMAN_APPROVED' when 'CORRECT' then 'HUMAN_CORRECTED' when 'REJECT' then 'HUMAN_REJECTED' else 'NEEDS_REVIEW' end;
  -- Rejection suppresses active eligibility but deliberately preserves the entity,
  -- evidence, score history and immutable review receipt for future calibration.
  v_status:=case when p_action='REJECT' then 'SUPPRESSED' else 'ACTIVE' end;

  update public.genesis_g8_intelligence_entities set review_state=v_review_state,status=v_status,updated_at=now() where id=p_entity_id;

  return query
  insert into public.genesis_g8_human_review_receipts(entity_id,action,reason_code,note,correction_json,reviewer_user_id,truth_snapshot_id)
  values(p_entity_id,p_action,p_reason_code,p_note,p_correction,p_reviewer_user_id,p_truth_snapshot_id)
  returning *;
end $$;

revoke all on function public.upsert_genesis_g8_intelligence_entity(text,text,text,text) from public,anon,authenticated;
revoke all on function public.ensure_genesis_g8_contract_claims(uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.insert_genesis_g8_evidence(uuid,text,text,text,text,text,text,double precision,double precision,double precision,timestamptz,text,jsonb) from public,anon,authenticated;
revoke all on function public.insert_genesis_g8_truth_snapshot(uuid,text,text,double precision,double precision,double precision,double precision,boolean,double precision,jsonb,jsonb,timestamptz) from public,anon,authenticated;
revoke all on function public.record_genesis_g8_human_review(uuid,text,uuid,text,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.upsert_genesis_g8_intelligence_entity(text,text,text,text) to service_role;
grant execute on function public.ensure_genesis_g8_contract_claims(uuid,text,jsonb) to service_role;
grant execute on function public.insert_genesis_g8_evidence(uuid,text,text,text,text,text,text,double precision,double precision,double precision,timestamptz,text,jsonb) to service_role;
grant execute on function public.insert_genesis_g8_truth_snapshot(uuid,text,text,double precision,double precision,double precision,double precision,boolean,double precision,jsonb,jsonb,timestamptz) to service_role;
grant execute on function public.record_genesis_g8_human_review(uuid,text,uuid,text,text,jsonb,uuid) to service_role;

comment on table public.genesis_g8_intelligence_entities is 'Genesis G8 shared public commercial intelligence identities. Organisation-neutral by design; customer-private data must not be stored here.';
comment on table public.genesis_g8_intelligence_evidence is 'Evidence with explicit Knowledge/Discovery channel provenance. Evidence is additive; contradictory evidence is preserved, never overwritten.';
comment on table public.genesis_g8_truth_snapshots is 'Immutable versioned Truth Index calculation history. Current state is derived from latest snapshot rather than overwriting historical calculations.';
comment on table public.genesis_g8_human_review_receipts is 'Immutable human review receipts. REJECT suppresses active eligibility but does not delete accumulated intelligence.';

-- Genesis G8.2 / MR-TI-2 Build 1 — additive foundation only.
-- IMPORTANT: this migration deliberately does not alter or drop the existing
-- genesis_g8_* entity, claim, evidence, truth snapshot, review, RLS or RPC contracts.
-- MR-TI-1 history remains immutable and readable. MR-TI-2 semantics live in
-- sidecar tables so a rollback never requires rewriting legacy data.

create table if not exists public.genesis_g8_truth_v2_claim_profiles (
  claim_id uuid primary key references public.genesis_g8_intelligence_claims(id) on delete cascade,
  engine_version text not null default 'MR-TI-2.0',
  impact_class text not null check (impact_class in ('FOUNDATIONAL','COMMERCIAL','SUPPORTING','OPTIONAL')),
  claim_weight double precision not null check (claim_weight > 0),
  freshness_half_life_days double precision not null check (freshness_half_life_days > 0),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.genesis_g8_truth_v2_evidence_assessments (
  evidence_id uuid primary key references public.genesis_g8_intelligence_evidence(id) on delete cascade,
  engine_version text not null default 'MR-TI-2.0',
  authority double precision not null check (authority between 0 and 1),
  directness double precision not null check (directness between 0 and 1),
  traceability double precision not null check (traceability between 0 and 1),
  source_published_at timestamptz,
  source_lineage_key text,
  derivative_of_evidence_id uuid references public.genesis_g8_intelligence_evidence(id) on delete set null,
  derivative_depth integer not null default 0 check (derivative_depth >= 0),
  ai_observation_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (derivative_of_evidence_id is null or derivative_of_evidence_id <> evidence_id)
);

create table if not exists public.genesis_g8_truth_v2_claim_relationships (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.genesis_g8_intelligence_entities(id) on delete cascade,
  from_claim_id uuid not null references public.genesis_g8_intelligence_claims(id) on delete cascade,
  to_claim_id uuid not null references public.genesis_g8_intelligence_claims(id) on delete cascade,
  relationship_type text not null check (relationship_type in ('DEPENDS_ON','CONTRADICTS')),
  strength double precision not null check (strength between 0 and 1),
  provenance_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_claim_id <> to_claim_id),
  unique(from_claim_id,to_claim_id,relationship_type)
);

create table if not exists public.genesis_g8_truth_v2_snapshots (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.genesis_g8_intelligence_entities(id) on delete cascade,
  engine_version text not null default 'MR-TI-2.0',
  contract_version text not null,
  truth_index double precision not null check (truth_index between 0 and 99.9),
  represented_confidence double precision not null check (represented_confidence between 0 and 99.9),
  coverage double precision not null check (coverage between 0 and 100),
  foundational_integrity double precision not null check (foundational_integrity between 0 and 99.9),
  max_contradiction_severity double precision not null check (max_contradiction_severity between 0 and 1),
  review_state text not null check (review_state in ('AUTO','VERIFY','HUMAN_REVIEW_REQUIRED')),
  result_json jsonb not null,
  calculated_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists genesis_g8_truth_v2_claim_profiles_impact_idx
  on public.genesis_g8_truth_v2_claim_profiles(impact_class,claim_weight desc);
create index if not exists genesis_g8_truth_v2_evidence_lineage_idx
  on public.genesis_g8_truth_v2_evidence_assessments(source_lineage_key,derivative_depth);
create index if not exists genesis_g8_truth_v2_relationship_entity_idx
  on public.genesis_g8_truth_v2_claim_relationships(entity_id,relationship_type);
create index if not exists genesis_g8_truth_v2_snapshot_entity_calc_idx
  on public.genesis_g8_truth_v2_snapshots(entity_id,calculated_at desc);
create index if not exists genesis_g8_truth_v2_snapshot_review_idx
  on public.genesis_g8_truth_v2_snapshots(review_state,calculated_at desc);

alter table public.genesis_g8_truth_v2_claim_profiles enable row level security;
alter table public.genesis_g8_truth_v2_evidence_assessments enable row level security;
alter table public.genesis_g8_truth_v2_claim_relationships enable row level security;
alter table public.genesis_g8_truth_v2_snapshots enable row level security;

-- Match the existing G8 shared-intelligence trust boundary: internal service role only.
revoke all on public.genesis_g8_truth_v2_claim_profiles from anon, authenticated;
revoke all on public.genesis_g8_truth_v2_evidence_assessments from anon, authenticated;
revoke all on public.genesis_g8_truth_v2_claim_relationships from anon, authenticated;
revoke all on public.genesis_g8_truth_v2_snapshots from anon, authenticated;

grant select,insert,update,delete on public.genesis_g8_truth_v2_claim_profiles to service_role;
grant select,insert,update,delete on public.genesis_g8_truth_v2_evidence_assessments to service_role;
grant select,insert,update,delete on public.genesis_g8_truth_v2_claim_relationships to service_role;
grant select,insert on public.genesis_g8_truth_v2_snapshots to service_role;

comment on table public.genesis_g8_truth_v2_claim_profiles is
'MR-TI-2 claim semantics sidecar. Does not mutate legacy claim criticality or historical TI-1 contracts.';
comment on table public.genesis_g8_truth_v2_evidence_assessments is
'MR-TI-2 evidence primitive sidecar: authority, directness, traceability and source-lineage observations. Derived MR-TI-2 maths is not stored here.';
comment on table public.genesis_g8_truth_v2_claim_relationships is
'MR-TI-2 Matrix 2 relationship edges. Initial relationship types are DEPENDS_ON and CONTRADICTS.';
comment on table public.genesis_g8_truth_v2_snapshots is
'Immutable MR-TI-2 calculation history kept separate from legacy genesis_g8_truth_snapshots so critical-ceiling history is never rewritten or overloaded.';

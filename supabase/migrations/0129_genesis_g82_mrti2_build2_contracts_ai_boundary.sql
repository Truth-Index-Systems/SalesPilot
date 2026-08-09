-- Genesis G8.2 / MR-TI-2 Build 2 — deterministic contract catalogue and profile sync.
-- Additive only. No legacy Truth tables or rows are altered.

create table if not exists public.genesis_g8_truth_v2_contract_definitions (
  engine_version text not null default 'MR-TI-2.0',
  contract_version text not null default 'MR-TI-2-CONTRACTS-1.0',
  entity_type text not null check (entity_type in ('industry','sector','company','contact','route','opportunity')),
  claim_key text not null,
  label text not null,
  proposition text not null,
  impact_class text not null check (impact_class in ('FOUNDATIONAL','COMMERCIAL','SUPPORTING','OPTIONAL')),
  claim_weight double precision not null check (claim_weight > 0),
  freshness_half_life_days double precision not null check (freshness_half_life_days > 0),
  counts_toward_coverage boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (contract_version,entity_type,claim_key)
);

insert into public.genesis_g8_truth_v2_contract_definitions(
  entity_type,claim_key,label,proposition,impact_class,claim_weight,freshness_half_life_days,counts_toward_coverage
) values
  ('industry','identity','Industry identity','The entity is the named industry.','FOUNDATIONAL',1.00,730,true),
  ('industry','definition','Industry definition','The industry is accurately defined.','FOUNDATIONAL',0.80,365,true),
  ('industry','sector_structure','Sector structure','The described sector structure currently represents the industry.','COMMERCIAL',0.65,180,true),
  ('industry','buyer_archetypes','Buyer archetypes','The stated buyer archetypes are materially present in this industry.','COMMERCIAL',0.70,90,true),
  ('industry','commercial_problems','Commercial problems','The stated commercial problems are current and material in this industry.','COMMERCIAL',0.75,60,true),
  ('industry','buying_signals','Buying signals','The stated buying signals are current indicators of commercial activity.','SUPPORTING',0.45,30,true),
  ('industry','company_coverage','Company coverage','The known company set materially represents the industry segment being researched.','COMMERCIAL',0.70,30,true),
  ('industry','contact_coverage','Contact coverage','The known contacts provide useful buyer coverage for the industry.','SUPPORTING',0.40,30,true),
  ('industry','route_coverage','Route coverage','The known routes provide useful commercial access coverage for the industry.','SUPPORTING',0.45,30,true),
  ('sector','identity','Sector identity','The entity is the named sector.','FOUNDATIONAL',1.00,730,true),
  ('sector','parent_industry','Parent industry','The sector belongs to the stated parent industry.','FOUNDATIONAL',0.95,365,true),
  ('sector','definition','Sector definition','The sector is accurately defined.','FOUNDATIONAL',0.80,365,true),
  ('sector','business_models','Common business models','The stated business models materially represent the sector.','COMMERCIAL',0.60,180,true),
  ('sector','buyer_archetypes','Buyer archetypes','The stated buyer archetypes are materially present in the sector.','COMMERCIAL',0.70,90,true),
  ('sector','commercial_problems','Commercial problems','The stated commercial problems are current and material in the sector.','COMMERCIAL',0.75,60,true),
  ('sector','buying_signals','Buying signals','The stated buying signals are current indicators of commercial activity.','SUPPORTING',0.45,30,true),
  ('sector','company_coverage','Company coverage','The known company set materially represents the sector being researched.','COMMERCIAL',0.70,30,true),
  ('company','identity','Canonical company identity','The company exists as the named legal or trading entity.','FOUNDATIONAL',1.00,365,true),
  ('company','canonical_domain','Canonical company domain','The stated web domain belongs to the company.','FOUNDATIONAL',0.95,180,true),
  ('company','current_operation','Company currently operating','The company is currently operating.','FOUNDATIONAL',1.00,60,true),
  ('company','industry','Industry','The company operates in the stated industry.','COMMERCIAL',0.70,180,true),
  ('company','sector','Sector','The company operates in the stated sector.','COMMERCIAL',0.60,120,true),
  ('company','geography','Operating geography','The company operates in the stated geography.','COMMERCIAL',0.55,120,true),
  ('company','offering','Products and services','The company currently provides the stated products or services.','COMMERCIAL',0.75,90,true),
  ('company','customer_market','Customer market','The company serves the stated customer market.','COMMERCIAL',0.75,90,true),
  ('company','company_scale','Company scale','The stated scale estimate materially represents the company.','SUPPORTING',0.25,60,true),
  ('company','commercial_problems','Relevant commercial problems','The stated commercial problems plausibly and currently apply to the company.','COMMERCIAL',0.65,45,true),
  ('company','buying_signals','Current buying signals','The stated signals are current evidence of potential buying activity.','SUPPORTING',0.45,14,true),
  ('company','contact_coverage','Decision-maker coverage','The known contacts materially cover relevant decision-making authority.','COMMERCIAL',0.60,30,true),
  ('company','route_coverage','Commercial route coverage','At least one current commercially usable route to the company is represented.','COMMERCIAL',0.70,30,true),
  ('contact','identity','Person identity','The named person exists and is correctly identified.','FOUNDATIONAL',0.90,365,true),
  ('contact','company_relationship','Current company relationship','The person is currently associated with the stated company.','FOUNDATIONAL',0.95,45,true),
  ('contact','current_employment','Current employment','The person currently works for the stated company.','FOUNDATIONAL',1.00,45,true),
  ('contact','role','Current role','The person currently holds the stated role.','COMMERCIAL',0.80,45,true),
  ('contact','seniority','Seniority','The stated seniority accurately represents the person''s current organisational level.','COMMERCIAL',0.60,60,true),
  ('contact','authority','Commercial authority','The person has material authority or influence over the relevant commercial decision.','COMMERCIAL',0.90,45,true),
  ('contact','work_location','Work location','The stated work location is current.','SUPPORTING',0.25,120,true),
  ('contact','linkedin','LinkedIn/profile URL','The stated professional profile belongs to the person and is current enough to identify them.','SUPPORTING',0.30,90,true),
  ('contact','email','Work email','The stated work email belongs to the person at the stated company.','COMMERCIAL',0.65,90,true),
  ('contact','email_verification','Email verification','The stated work email is currently deliverable or independently verified.','COMMERCIAL',0.75,30,true),
  ('contact','commercial_relevance','Commercial relevance','The person is commercially relevant to the current buying hypothesis.','COMMERCIAL',0.70,45,true),
  ('route','target_company','Target company','The route leads to the intended target company.','FOUNDATIONAL',1.00,60,true),
  ('route','route_identity','Route identity','The described route exists as a current identifiable route.','FOUNDATIONAL',0.95,45,true),
  ('route','entry_point','Entry point','The stated entry point is currently accessible.','COMMERCIAL',0.85,45,true),
  ('route','decision_maker','Decision maker','The route reaches or credibly leads toward a relevant decision maker.','COMMERCIAL',0.90,45,true),
  ('route','problem','Commercial problem','The route is connected to the stated commercial problem.','COMMERCIAL',0.75,30,true),
  ('route','commercial_rationale','Commercial rationale','The route has a credible commercial rationale for engagement.','COMMERCIAL',0.80,30,true),
  ('route','route_path','Route path','The described route path is currently actionable.','COMMERCIAL',0.90,30,true),
  ('route','supporting_signal','Supporting signal','The route is supported by a current external commercial signal.','SUPPORTING',0.45,14,true),
  ('route','dependencies','Route dependencies','The stated route dependencies are accurately represented.','SUPPORTING',0.35,30,true),
  ('route','risks','Route risks and uncertainties','The material route risks and uncertainties are represented.','SUPPORTING',0.35,30,true),
  ('opportunity','company','Company','The opportunity is attached to the correct active company.','FOUNDATIONAL',1.00,60,true),
  ('opportunity','commercial_fit','Commercial fit','There is a current material commercial fit between seller and target.','FOUNDATIONAL',0.90,30,true),
  ('opportunity','viable_route','Viable commercial route','A current viable commercial route exists for this opportunity.','FOUNDATIONAL',0.95,30,true),
  ('opportunity','contact','Relevant contact','The represented contact is relevant to the opportunity.','COMMERCIAL',0.75,45,true),
  ('opportunity','commercial_reason','Commercial reason','There is a current evidence-backed reason for commercial engagement.','COMMERCIAL',0.90,30,true),
  ('opportunity','timing_signal','Timing signal','A current signal supports the timing of the opportunity.','SUPPORTING',0.50,14,true),
  ('opportunity','supporting_evidence','Supporting evidence','The opportunity is supported by sufficient current external evidence.','COMMERCIAL',0.80,30,true),
  ('opportunity','outreach_hypothesis','Outreach hypothesis','The proposed outreach hypothesis follows from represented evidence.','SUPPORTING',0.40,30,true),
  ('opportunity','risks','Risks and uncertainty','The material risks and uncertainties are represented.','SUPPORTING',0.35,30,true)
on conflict (contract_version,entity_type,claim_key) do update set
  label=excluded.label, proposition=excluded.proposition, impact_class=excluded.impact_class,
  claim_weight=excluded.claim_weight, freshness_half_life_days=excluded.freshness_half_life_days,
  counts_toward_coverage=excluded.counts_toward_coverage, updated_at=now();

create or replace function public.sync_genesis_g8_truth_v2_claim_profiles(p_entity_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare v_count integer := 0;
begin
  insert into public.genesis_g8_truth_v2_claim_profiles(
    claim_id,engine_version,impact_class,claim_weight,freshness_half_life_days,metadata_json,updated_at
  )
  select c.id,d.engine_version,d.impact_class,d.claim_weight,d.freshness_half_life_days,
    jsonb_build_object('contractVersion',d.contract_version,'claimKey',d.claim_key,'proposition',d.proposition,'countsTowardCoverage',d.counts_toward_coverage),
    now()
  from public.genesis_g8_intelligence_claims c
  join public.genesis_g8_intelligence_entities e on e.id=c.entity_id
  join public.genesis_g8_truth_v2_contract_definitions d
    on d.entity_type=e.entity_type and d.claim_key=c.claim_key and d.contract_version='MR-TI-2-CONTRACTS-1.0'
  where c.entity_id=p_entity_id
  on conflict (claim_id) do update set
    engine_version=excluded.engine_version, impact_class=excluded.impact_class,
    claim_weight=excluded.claim_weight, freshness_half_life_days=excluded.freshness_half_life_days,
    metadata_json=excluded.metadata_json, updated_at=now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

insert into public.genesis_g8_truth_v2_claim_profiles(
  claim_id,engine_version,impact_class,claim_weight,freshness_half_life_days,metadata_json,updated_at
)
select c.id,d.engine_version,d.impact_class,d.claim_weight,d.freshness_half_life_days,
  jsonb_build_object('contractVersion',d.contract_version,'claimKey',d.claim_key,'proposition',d.proposition,'countsTowardCoverage',d.counts_toward_coverage),now()
from public.genesis_g8_intelligence_claims c
join public.genesis_g8_intelligence_entities e on e.id=c.entity_id
join public.genesis_g8_truth_v2_contract_definitions d
  on d.entity_type=e.entity_type and d.claim_key=c.claim_key and d.contract_version='MR-TI-2-CONTRACTS-1.0'
on conflict (claim_id) do update set
  engine_version=excluded.engine_version, impact_class=excluded.impact_class,
  claim_weight=excluded.claim_weight, freshness_half_life_days=excluded.freshness_half_life_days,
  metadata_json=excluded.metadata_json, updated_at=now();

alter table public.genesis_g8_truth_v2_contract_definitions enable row level security;
revoke all on public.genesis_g8_truth_v2_contract_definitions from anon, authenticated;
grant select,insert,update,delete on public.genesis_g8_truth_v2_contract_definitions to service_role;
revoke all on function public.sync_genesis_g8_truth_v2_claim_profiles(uuid) from public, anon, authenticated;
grant execute on function public.sync_genesis_g8_truth_v2_claim_profiles(uuid) to service_role;

comment on table public.genesis_g8_truth_v2_contract_definitions is
'Deterministic MR-TI-2 claim contract catalogue. V2 impact class, weight, proposition and half-life are independent of legacy TI-1 criticality semantics.';
comment on function public.sync_genesis_g8_truth_v2_claim_profiles(uuid) is
'Copies deterministic MR-TI-2 contract semantics onto already-existing G8 claim IDs without altering legacy claim rows.';

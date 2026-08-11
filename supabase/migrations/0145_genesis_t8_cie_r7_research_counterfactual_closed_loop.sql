-- CIE-R7 Research + Counterfactual Closed Loop.
create table if not exists public.cie_r7_research_directives (
  repair_id uuid primary key references public.genesis_g8_discovery_repair_queue(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  reality_id text not null,
  claim_id uuid not null references public.genesis_g8_intelligence_claims(id) on delete cascade,
  claim_key text not null,
  impact_class text not null check (impact_class in ('NO_DECISION_VALUE','ENRICHMENT','ASSURANCE_RELEVANT','STABILITY_RELEVANT','DECISION_SHARPENING','DECISION_BLOCKING')),
  impact_precedence integer not null check (impact_precedence between 0 and 5),
  order_index integer not null check (order_index>=0),
  authority_mode text not null default 'AUTHORITATIVE' check(authority_mode='AUTHORITATIVE'),
  directive_json jsonb not null,
  status text not null default 'ACTIVE' check(status in ('ACTIVE','RETIRED')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.cie_r7_research_directives enable row level security;
revoke all on public.cie_r7_research_directives from public,anon,authenticated;
grant all on public.cie_r7_research_directives to service_role;

create or replace function public.get_cie_r7_research_context(p_scheduler_run_id uuid,p_limit integer default 100)
returns table(opportunity_id uuid,reality_id text,repair_id uuid,claim_id uuid,claim_key text,objective text,repair_mode text,blocking_mode text,stability_json jsonb)
language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.pipeline_scheduler_lease where singleton=true and run_id=p_scheduler_run_id and lease_expires_at>now()) then raise exception 'PIPELINE_SCHEDULER_LEASE_NOT_HELD'; end if;
  return query
  select o.id,r4.reality_id,q.id,q.claim_id,q.claim_key,q.objective,q.repair_mode,q.blocking_mode,r4.decision_json->'stability'
  from public.opportunities o
  join public.cie_r4_commercial_decisions r4 on r4.opportunity_id=o.id
  join public.genesis_g8_discovery_repair_queue q on q.company_id=o.company_id and q.status in ('QUEUED','CLAIMED')
  where r4.disposition in ('RESEARCH_REQUIRED','COMMERCIAL_CANDIDATE') and r4.decision_json ? 'stability'
  order by o.created_at,o.id,q.created_at,q.id
  limit greatest(1,least(coalesce(p_limit,100),250));
end $$;

create or replace function public.replace_cie_r7_research_directives(p_opportunity_id uuid,p_reality_id text,p_directives_json jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare d jsonb; rid uuid;
begin
  if jsonb_typeof(coalesce(p_directives_json,'[]'::jsonb))<>'array' then raise exception 'CIE_R7_DIRECTIVES_MUST_BE_ARRAY'; end if;
  update public.cie_r7_research_directives set status='RETIRED',updated_at=now() where opportunity_id=p_opportunity_id and status='ACTIVE';
  for d in select value from jsonb_array_elements(p_directives_json) loop
    if coalesce(d->>'authorityMode','')<>'AUTHORITATIVE' then raise exception 'CIE_R7_NON_AUTHORITATIVE_RESEARCH_DIRECTIVE'; end if;
    rid=(d->>'repairId')::uuid;
    if not exists(select 1 from public.genesis_g8_discovery_repair_queue q where q.id=rid and q.claim_id=(d->>'claimId')::uuid) then raise exception 'CIE_R7_REPAIR_CLAIM_MISMATCH'; end if;
    insert into public.cie_r7_research_directives(repair_id,opportunity_id,reality_id,claim_id,claim_key,impact_class,impact_precedence,order_index,directive_json,status)
    values(rid,p_opportunity_id,p_reality_id,(d->>'claimId')::uuid,d->>'claimKey',d->>'impactClass',(d->>'impactPrecedence')::integer,(d->>'orderIndex')::integer,d,'ACTIVE')
    on conflict(repair_id) do update set opportunity_id=excluded.opportunity_id,reality_id=excluded.reality_id,claim_id=excluded.claim_id,claim_key=excluded.claim_key,impact_class=excluded.impact_class,impact_precedence=excluded.impact_precedence,order_index=excluded.order_index,directive_json=excluded.directive_json,status='ACTIVE',updated_at=now();
  end loop;
end $$;

create or replace function public.retire_stale_cie_r7_research_directives()
returns table(retired integer) language plpgsql security definer set search_path=public as $$
declare n integer;
begin
  update public.cie_r7_research_directives d set status='RETIRED',updated_at=now()
  where d.status='ACTIVE' and not exists(select 1 from public.genesis_g8_discovery_repair_queue q where q.id=d.repair_id and q.status in ('QUEUED','CLAIMED'));
  get diagnostics n=row_count; return query select n;
end $$;

-- Preserve the existing repair claim/lease semantics, but let active CIE-R7
-- directives govern decision value before the historical operational order.
drop function if exists public.claim_genesis_g8_discovery_repairs(integer,text,integer);
create function public.claim_genesis_g8_discovery_repairs(p_limit integer default 2,p_worker_id text default 'genesis-g8-repair',p_lease_seconds integer default 75)
returns table(id uuid,dispatch_key text,entity_id uuid,entity_type text,entity_canonical_key text,entity_display_name text,claim_id uuid,claim_key text,claim_label text,impact_class text,repair_mode text,objective text,minimum_evidence integer,additional_evidence_needed integer,blocking_mode text,organisation_id uuid,campaign_id uuid,company_id uuid,attempt_count integer,lease_token text)
language plpgsql security definer set search_path=public as $$
begin
 return query with candidates as (
  select q.id from public.genesis_g8_discovery_repair_queue q
  join public.genesis_g8_truth_v2_claim_profiles p on p.claim_id=q.claim_id and p.engine_version='MR-TI-2.0'
  left join public.cie_r7_research_directives d on d.repair_id=q.id and d.status='ACTIVE'
  where q.status in ('QUEUED','CLAIMED') and coalesce(q.next_attempt_at,now())<=now() and (q.status='QUEUED' or q.lease_expires_at is null or q.lease_expires_at<now())
  order by case when d.repair_id is null then 1 else 0 end,d.impact_precedence desc nulls last,d.order_index asc nulls last,
    case when q.organisation_id is not null or q.campaign_id is not null or q.company_id is not null then 0 else 1 end,
    case q.blocking_mode when 'BLOCKING_BEFORE_USE' then 0 else 1 end,
    case p.impact_class when 'FOUNDATIONAL' then 0 when 'COMMERCIAL' then 1 when 'SUPPORTING' then 2 else 3 end,p.claim_weight desc,q.created_at
  for update of q skip locked limit greatest(1,least(coalesce(p_limit,2),4))
 ), claimed as (
  update public.genesis_g8_discovery_repair_queue q set status='CLAIMED',claimed_by=left(coalesce(p_worker_id,'genesis-g8-repair'),240),claimed_at=now(),lease_token=gen_random_uuid()::text,lease_expires_at=now()+(greatest(30,least(coalesce(p_lease_seconds,75),180))||' seconds')::interval,attempt_count=q.attempt_count+1,updated_at=now() from candidates c where q.id=c.id returning q.*
 )
 select c.id,c.dispatch_key,c.entity_id,c.entity_type,e.canonical_key,e.display_name,c.claim_id,c.claim_key,ic.label,p.impact_class,c.repair_mode,c.objective,c.minimum_evidence,c.additional_evidence_needed,c.blocking_mode,c.organisation_id,c.campaign_id,c.company_id,c.attempt_count,c.lease_token
 from claimed c join public.genesis_g8_intelligence_entities e on e.id=c.entity_id join public.genesis_g8_intelligence_claims ic on ic.id=c.claim_id and ic.entity_id=c.entity_id join public.genesis_g8_truth_v2_claim_profiles p on p.claim_id=c.claim_id and p.engine_version='MR-TI-2.0';
end $$;

revoke all on function public.get_cie_r7_research_context(uuid,integer) from public,anon,authenticated;
revoke all on function public.replace_cie_r7_research_directives(uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.retire_stale_cie_r7_research_directives() from public,anon,authenticated;
revoke all on function public.claim_genesis_g8_discovery_repairs(integer,text,integer) from public,anon,authenticated;
grant execute on function public.get_cie_r7_research_context(uuid,integer) to service_role;
grant execute on function public.replace_cie_r7_research_directives(uuid,text,jsonb) to service_role;
grant execute on function public.retire_stale_cie_r7_research_directives() to service_role;
grant execute on function public.claim_genesis_g8_discovery_repairs(integer,text,integer) to service_role;

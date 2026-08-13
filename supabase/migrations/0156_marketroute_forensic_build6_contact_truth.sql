BEGIN;

-- MarketRoute Forensic Build 6: Contact Truth.
-- Binary legacy verification is retained as history only. R6 authority consumes
-- claim-level, time-aware contact truth snapshots produced from raw evidence.

alter table public.contact_evidence add column if not exists source_published_at timestamptz;
alter table public.contact_evidence add column if not exists truth_polarity text not null default 'SUPPORTS';
do $$ begin
  if not exists(select 1 from pg_constraint where conname='contact_evidence_truth_polarity_check') then
    alter table public.contact_evidence add constraint contact_evidence_truth_polarity_check check(truth_polarity in ('SUPPORTS','CONTRADICTS'));
  end if;
end $$;
comment on column public.contact_evidence.verified is 'LEGACY HISTORICAL METADATA ONLY from FB6 onward. It has no CIE-R6 authority.';
comment on column public.contact_evidence.truth_polarity is 'Explicit evidence polarity for contact truth. Missing/ambiguous evidence is never inferred as contradiction.';

alter table public.cie_r6_contact_decisions add column if not exists contact_truth_json jsonb not null default '[]'::jsonb;
alter table public.cie_r6_contact_decisions add column if not exists contact_truth_fingerprint text;
alter table public.cie_r6_contact_decisions add column if not exists next_revalidation_at timestamptz;
alter table public.cie_r6_contact_decisions add column if not exists producer_version text;
update public.cie_r6_contact_decisions set producer_version='PRE-FB6' where producer_version is null;
alter table public.cie_r6_contact_decisions alter column producer_version set default 'MR-T8-FB6-R6-1.0.0';
alter table public.cie_r6_contact_decisions alter column producer_version set not null;

create table if not exists public.genesis_t8_contact_truth_snapshots (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  organisation_id uuid not null,
  campaign_id uuid not null,
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  semantics_version text not null check(semantics_version='MR-T8-FB6-CONTACT-TRUTH-1.0.0'),
  r5_authority_fingerprint text not null check(r5_authority_fingerprint ~ '^[0-9a-f]{64}$'),
  source_fingerprint text not null check(source_fingerprint ~ '^[0-9a-f]{64}$'),
  snapshot_json jsonb not null check(jsonb_typeof(snapshot_json)='object'),
  authority_ready boolean not null,
  next_revalidation_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists genesis_t8_contact_truth_snapshots_contact_idx on public.genesis_t8_contact_truth_snapshots(contact_id,created_at desc);
create index if not exists genesis_t8_contact_truth_snapshots_opportunity_idx on public.genesis_t8_contact_truth_snapshots(opportunity_id,created_at desc);
alter table public.genesis_t8_contact_truth_snapshots enable row level security;
revoke all on public.genesis_t8_contact_truth_snapshots from public,anon,authenticated;
grant select on public.genesis_t8_contact_truth_snapshots to service_role;

-- Return shape intentionally remains unchanged to avoid PostgreSQL OUT-signature churn.
create or replace function public.get_cie_r6_contact_authority_context(p_scheduler_run_id uuid,p_limit integer default 40)
returns table(opportunity_id uuid,reality_id text,commercial_routes jsonb,contacts jsonb,r4_authority_fingerprint text)
language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.pipeline_scheduler_lease where singleton=true and run_id=p_scheduler_run_id and lease_expires_at>now()) then raise exception 'PIPELINE_SCHEDULER_LEASE_NOT_HELD'; end if;
  return query
  select o.id,d.reality_id,
    coalesce((select jsonb_agg(jsonb_build_object(
      'id',r.id::text,'routeType',r.route_type,'label',r.label,'entryRole',r.entry_role,'department',r.department,'contactName',r.contact_name,'contactRole',r.contact_role,'targetRole',r.target_role,
      'channelType',r.channel_type,'channelValue',r.channel_value,'routeSemanticsVersion',r.route_semantics_version,
      'evidence',coalesce((select jsonb_agg(jsonb_build_object('evidenceType',e.evidence_type,'claim',e.claim,'sourceUrl',e.source_url,'excerpt',e.excerpt,'verified',e.verified,'excerptMatched',e.excerpt_matched) order by e.created_at,e.id) from public.commercial_route_evidence e where e.route_id=r.id),'[]'::jsonb)
    ) order by r.id) from public.commercial_routes r where r.organisation_id=o.organisation_id and r.campaign_id=o.campaign_id and r.company_id=o.company_id),'[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
      'id',c.id::text,'full_name',c.full_name,'role_title',c.role_title,'department',c.department,'email_address',c.email_address,'email_status',c.email_status,'linkedin_profile_url',c.linkedin_profile_url,'linkedin_status',c.linkedin_status,'review_status',c.review_status,
      'company_name',co.company_name,'company_domain',co.canonical_domain,
      'evidence',coalesce((select jsonb_agg(jsonb_build_object(
        'id',e.id::text,'evidenceType',e.evidence_type,'claim',e.claim,'sourceUrl',e.source_url,'sourceTitle',e.source_title,'excerpt',e.excerpt,
        'sourceKind',e.source_kind,'sourceDomain',e.source_domain,'excerptMatched',e.excerpt_matched,'retrievedAt',e.retrieved_at,
        'sourcePublishedAt',e.source_published_at,'truthPolarity',e.truth_polarity
      ) order by e.created_at,e.id) from public.contact_evidence e where e.contact_id=c.id),'[]'::jsonb)
    ) order by c.id)
      from public.contacts c join public.companies co on co.id=c.company_id
      where c.organisation_id=o.organisation_id and c.campaign_id=o.campaign_id and c.company_id=o.company_id),'[]'::jsonb),
    d.authority_fingerprint
  from public.opportunities o join public.cie_r4_commercial_decisions d on d.opportunity_id=o.id and d.disposition='COMMERCIAL_CANDIDATE'
    and d.producer_version='MR-T8-FB3-1.0.0' and d.production_id is not null and d.target_truth_semantics_version='MR-TI-2-TFR1' and d.authority_fingerprint ~ '^[0-9a-f]{64}$'
  left join public.cie_r6_contact_decisions cd on cd.opportunity_id=o.id
  left join public.cie_r5_route_decisions r5 on r5.opportunity_id=o.id
  where o.status='BUILDING' and (
    r5.opportunity_id is null or r5.authority_status='STALE' or r5.producer_version is distinct from 'MR-T8-FB5-R5-1.0.0' or r5.parent_r4_authority_fingerprint is distinct from d.authority_fingerprint
    or cd.opportunity_id is null or cd.authority_status='STALE' or cd.applied_at is null or cd.producer_version is distinct from 'MR-T8-FB6-R6-1.0.0'
    or cd.parent_r4_authority_fingerprint is distinct from d.authority_fingerprint or cd.parent_r5_authority_fingerprint is distinct from r5.authority_fingerprint
  ) order by o.created_at,o.id limit greatest(1,least(coalesce(p_limit,40),100));
end $$;
revoke all on function public.get_cie_r6_contact_authority_context(uuid,integer) from public,anon,authenticated;
grant execute on function public.get_cie_r6_contact_authority_context(uuid,integer) to service_role;

-- Signature changes: drop explicitly before recreation (rerun-safe and 42P13-safe).
drop function if exists public.persist_cie_r6_contact_decision(uuid,text,text,text,uuid,jsonb,jsonb,jsonb);
drop function if exists public.persist_cie_r6_contact_decision(uuid,text,text,text,uuid,jsonb,text,timestamptz,jsonb,jsonb,jsonb);
create function public.persist_cie_r6_contact_decision(
  p_opportunity_id uuid,p_parent_r4_authority_fingerprint text,p_parent_r5_authority_fingerprint text,p_source_fingerprint text,
  p_primary_contact_id uuid,p_contact_truth_json jsonb,p_contact_truth_fingerprint text,p_next_revalidation_at timestamptz,
  p_contact_frontier_json jsonb,p_bindings_json jsonb,p_decision_json jsonb
) returns void language plpgsql security definer set search_path=public as $$
declare o public.opportunities%rowtype; r4 public.cie_r4_commercial_decisions%rowtype; r5 public.cie_r5_route_decisions%rowtype; b jsonb; t jsonb;
begin
  select * into o from public.opportunities where id=p_opportunity_id; if not found then raise exception 'CIE_R6_OPPORTUNITY_NOT_FOUND'; end if;
  select * into r4 from public.cie_r4_commercial_decisions where opportunity_id=o.id;
  select * into r5 from public.cie_r5_route_decisions where opportunity_id=o.id;
  if r5.opportunity_id is null or r5.authority_status<>'ACTIVE' or r5.producer_version<>'MR-T8-FB5-R5-1.0.0' or r5.authority_fingerprint is distinct from p_parent_r5_authority_fingerprint then raise exception 'CIE_R6_PARENT_R5_AUTHORITY_MISMATCH'; end if;
  if r4.producer_version<>'MR-T8-FB3-1.0.0' or r4.authority_fingerprint is distinct from p_parent_r4_authority_fingerprint or r5.parent_r4_authority_fingerprint is distinct from r4.authority_fingerprint then raise exception 'CIE_R6_PARENT_R4_AUTHORITY_MISMATCH'; end if;
  if p_parent_r4_authority_fingerprint !~ '^[0-9a-f]{64}$' or p_parent_r5_authority_fingerprint !~ '^[0-9a-f]{64}$' or p_source_fingerprint !~ '^[0-9a-f]{64}$' or p_contact_truth_fingerprint !~ '^[0-9a-f]{64}$' then raise exception 'CIE_R6_FINGERPRINT_INVALID'; end if;
  if p_source_fingerprint is distinct from p_contact_truth_fingerprint then raise exception 'CIE_R6_CONTACT_TRUTH_FINGERPRINT_MISMATCH'; end if;
  if jsonb_typeof(coalesce(p_contact_truth_json,'[]'::jsonb))<>'array' then raise exception 'CIE_R6_CONTACT_TRUTH_ARRAY_REQUIRED'; end if;
  if coalesce(p_decision_json->>'authorityMode','')<>'AUTHORITATIVE' or coalesce((p_decision_json->>'canUnlockOpportunity')::boolean,false) is not true then raise exception 'CIE_R6_NON_EXECUTABLE_DECISION'; end if;
  if p_primary_contact_id is not null and not exists(select 1 from public.contacts c where c.id=p_primary_contact_id and c.organisation_id=o.organisation_id and c.campaign_id=o.campaign_id and c.company_id=o.company_id) then raise exception 'CIE_R6_CONTACT_SCOPE_MISMATCH'; end if;
  if p_primary_contact_id is not null and not exists(select 1 from jsonb_array_elements(p_contact_truth_json) x where x->>'contactId'=p_primary_contact_id::text and x->>'semanticsVersion'='MR-T8-FB6-CONTACT-TRUTH-1.0.0' and coalesce((x->>'authorityReady')::boolean,false)=true) then raise exception 'CIE_R6_PRIMARY_CONTACT_NOT_TRUTH_QUALIFIED'; end if;
  for b in select value from jsonb_array_elements(coalesce(p_bindings_json,'[]'::jsonb)) loop if not (r5.selected_route_ids ? coalesce(b->>'routeId','')) then raise exception 'CIE_R6_BINDING_NOT_ON_R5_FRONTIER'; end if; end loop;

  insert into public.cie_r6_contact_decisions(opportunity_id,organisation_id,campaign_id,parent_r4_authority_fingerprint,parent_r5_authority_fingerprint,source_fingerprint,primary_contact_id,contact_frontier_json,bindings_json,decision_json,authority_status,invalidated_at,invalidation_reason,contact_truth_json,contact_truth_fingerprint,next_revalidation_at,producer_version)
  values(o.id,o.organisation_id,o.campaign_id,p_parent_r4_authority_fingerprint,p_parent_r5_authority_fingerprint,p_source_fingerprint,p_primary_contact_id,coalesce(p_contact_frontier_json,'[]'::jsonb),coalesce(p_bindings_json,'[]'::jsonb),p_decision_json,'ACTIVE',null,null,p_contact_truth_json,p_contact_truth_fingerprint,p_next_revalidation_at,'MR-T8-FB6-R6-1.0.0')
  on conflict(opportunity_id) do update set parent_r4_authority_fingerprint=excluded.parent_r4_authority_fingerprint,parent_r5_authority_fingerprint=excluded.parent_r5_authority_fingerprint,source_fingerprint=excluded.source_fingerprint,primary_contact_id=excluded.primary_contact_id,contact_frontier_json=excluded.contact_frontier_json,bindings_json=excluded.bindings_json,decision_json=excluded.decision_json,contact_truth_json=excluded.contact_truth_json,contact_truth_fingerprint=excluded.contact_truth_fingerprint,next_revalidation_at=excluded.next_revalidation_at,producer_version='MR-T8-FB6-R6-1.0.0',authority_status='ACTIVE',invalidated_at=null,invalidation_reason=null,applied_at=null,updated_at=now();

  for t in select value from jsonb_array_elements(p_contact_truth_json) loop
    if coalesce(t->>'contactId','') ~ '^[0-9a-fA-F-]{36}$' then
      insert into public.genesis_t8_contact_truth_snapshots(opportunity_id,organisation_id,campaign_id,company_id,contact_id,semantics_version,r5_authority_fingerprint,source_fingerprint,snapshot_json,authority_ready,next_revalidation_at)
      values(o.id,o.organisation_id,o.campaign_id,o.company_id,(t->>'contactId')::uuid,'MR-T8-FB6-CONTACT-TRUTH-1.0.0',p_parent_r5_authority_fingerprint,p_contact_truth_fingerprint,t,coalesce((t->>'authorityReady')::boolean,false),nullif(t->>'nextRevalidationAt','')::timestamptz);
    end if;
  end loop;
end $$;
revoke all on function public.persist_cie_r6_contact_decision(uuid,text,text,text,uuid,jsonb,text,timestamptz,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.persist_cie_r6_contact_decision(uuid,text,text,text,uuid,jsonb,text,timestamptz,jsonb,jsonb,jsonb) to service_role;

create or replace function public.invalidate_stale_cie_r6_authority(p_scheduler_run_id uuid)
returns table(invalidated integer) language plpgsql security definer set search_path=public as $$
declare r record; n integer:=0; reason text;
begin
  if not exists(select 1 from public.pipeline_scheduler_lease where singleton=true and run_id=p_scheduler_run_id and lease_expires_at>now()) then raise exception 'PIPELINE_SCHEDULER_LEASE_NOT_HELD'; end if;
  for r in select d.*,o.company_id,r4.authority_fingerprint as current_r4_fingerprint,r5.authority_fingerprint as current_r5_fingerprint,r5.authority_status as r5_status
    from public.cie_r6_contact_decisions d join public.opportunities o on o.id=d.opportunity_id
    left join public.cie_r4_commercial_decisions r4 on r4.opportunity_id=d.opportunity_id
    left join public.cie_r5_route_decisions r5 on r5.opportunity_id=d.opportunity_id
    where d.authority_status='ACTIVE' and (
      d.producer_version is distinct from 'MR-T8-FB6-R6-1.0.0'
      or r4.producer_version is distinct from 'MR-T8-FB3-1.0.0' or d.parent_r4_authority_fingerprint is distinct from r4.authority_fingerprint
      or r5.authority_status is distinct from 'ACTIVE' or r5.producer_version is distinct from 'MR-T8-FB5-R5-1.0.0' or d.parent_r5_authority_fingerprint is distinct from r5.authority_fingerprint
      or (d.primary_contact_id is not null and (d.next_revalidation_at is null or d.next_revalidation_at<=now()))
      or exists(select 1 from public.contacts c where c.organisation_id=o.organisation_id and c.campaign_id=o.campaign_id and c.company_id=o.company_id and c.updated_at>d.updated_at)
      or exists(select 1 from public.contact_evidence e where e.organisation_id=o.organisation_id and e.campaign_id=o.campaign_id and e.company_id=o.company_id and e.created_at>d.updated_at)
    ) for update of d skip locked
  loop
    reason:=case when r.producer_version is distinct from 'MR-T8-FB6-R6-1.0.0' then 'CONTACT_TRUTH_VERSION_CHANGED'
      when r.current_r4_fingerprint is null or r.parent_r4_authority_fingerprint is distinct from r.current_r4_fingerprint then 'PARENT_R4_AUTHORITY_CHANGED'
      when r.r5_status is distinct from 'ACTIVE' or r.parent_r5_authority_fingerprint is distinct from r.current_r5_fingerprint then 'PARENT_R5_AUTHORITY_CHANGED'
      when r.primary_contact_id is not null and (r.next_revalidation_at is null or r.next_revalidation_at<=now()) then 'CONTACT_TRUTH_TEMPORAL_REVALIDATION_DUE'
      else 'CONTACT_TRUTH_SOURCE_CHANGED' end;
    update public.cie_r6_contact_decisions set authority_status='STALE',invalidated_at=now(),invalidation_reason=reason,applied_at=null,updated_at=now() where opportunity_id=r.opportunity_id;
    update public.opportunities set status='BUILDING',primary_contact_id=null,opportunity_score=null,scoring_version='cie-r6-fb6-contact-truth-revalidation',updated_at=now() where id=r.opportunity_id and status not in ('APPROVED','REJECTED','ENGAGED');
    insert into public.cie_authority_invalidation_events(opportunity_id,organisation_id,campaign_id,authority_layer,previous_fingerprint,next_fingerprint,reason,scheduler_run_id,metadata_json)
      values(r.opportunity_id,r.organisation_id,r.campaign_id,'R6',r.contact_truth_fingerprint,r.current_r5_fingerprint,reason,p_scheduler_run_id,jsonb_build_object('nextRevalidationAt',r.next_revalidation_at));
    n:=n+1;
  end loop; return query select n;
end $$;

create or replace function public.apply_cie_r6_contact_authority()
returns table(applied integer,ready integer,organisational integer) language plpgsql security definer set search_path=public as $$
declare r record; a integer:=0; rd integer:=0; org integer:=0;
begin
  for r in select d.*,r4.disposition from public.cie_r6_contact_decisions d
    join public.cie_r4_commercial_decisions r4 on r4.opportunity_id=d.opportunity_id and r4.producer_version='MR-T8-FB3-1.0.0' and r4.production_id is not null and r4.target_truth_semantics_version='MR-TI-2-TFR1'
    join public.cie_r5_route_decisions r5 on r5.opportunity_id=d.opportunity_id and r5.authority_status='ACTIVE' and r5.producer_version='MR-T8-FB5-R5-1.0.0'
    where d.applied_at is null and d.authority_status='ACTIVE' and d.producer_version='MR-T8-FB6-R6-1.0.0' and r4.disposition='COMMERCIAL_CANDIDATE'
      and d.contact_truth_fingerprint ~ '^[0-9a-f]{64}$' and (d.next_revalidation_at is null or d.next_revalidation_at>now())
      and d.parent_r4_authority_fingerprint=r4.authority_fingerprint and d.parent_r5_authority_fingerprint=r5.authority_fingerprint
    order by d.updated_at,d.opportunity_id for update of d skip locked
  loop
    update public.opportunities set primary_contact_id=r.primary_contact_id,status='READY',opportunity_score=null,scoring_version='cie-r6-fb6-contact-truth-authority',updated_at=now() where id=r.opportunity_id and status not in ('APPROVED','REJECTED','ENGAGED');
    update public.cie_r6_contact_decisions set applied_at=now(),updated_at=now() where opportunity_id=r.opportunity_id;
    a:=a+1;rd:=rd+1;if r.primary_contact_id is null then org:=org+1;end if;
  end loop; return query select a,rd,org;
end $$;

-- Existing R6 authority must be re-established under Contact Truth.
update public.cie_r6_contact_decisions set authority_status='STALE',invalidated_at=coalesce(invalidated_at,now()),invalidation_reason='FB6_CONTACT_TRUTH_REVALIDATION',applied_at=null,updated_at=now()
where authority_status='ACTIVE' and producer_version is distinct from 'MR-T8-FB6-R6-1.0.0';
update public.opportunities o set status='BUILDING',primary_contact_id=null,opportunity_score=null,scoring_version='cie-r6-fb6-contact-truth-revalidation',updated_at=now()
where o.status in ('READY','NEEDS_CONTACT') and exists(select 1 from public.cie_r6_contact_decisions d where d.opportunity_id=o.id and d.authority_status='STALE');

comment on table public.genesis_t8_contact_truth_snapshots is 'Forensic Build 6 claim-level contact Truth snapshots. No legacy verified flag, weighted contact confidence, or AI numeric score owns R6 authority.';
comment on column public.cie_r6_contact_decisions.contact_truth_json is 'Exact FB6 contact Truth snapshots used by this R6 decision.';
comment on column public.cie_r6_contact_decisions.next_revalidation_at is 'Temporal authority boundary. Current contact authority must be re-evaluated by this instant.';

notify pgrst, 'reload schema';
COMMIT;

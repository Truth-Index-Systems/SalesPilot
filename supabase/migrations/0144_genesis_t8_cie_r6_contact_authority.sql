-- CIE-R6 Contact Authority.
-- Contact ranking is derived from authoritative route participation, not weighted confidence.
create table if not exists public.cie_r6_contact_decisions (
  opportunity_id uuid primary key references public.opportunities(id) on delete cascade,
  organisation_id uuid not null,
  campaign_id uuid not null,
  primary_contact_id uuid references public.contacts(id) on delete set null,
  contact_frontier_json jsonb not null default '[]'::jsonb,
  bindings_json jsonb not null default '[]'::jsonb,
  authority_mode text not null default 'AUTHORITATIVE' check(authority_mode='AUTHORITATIVE'),
  decision_json jsonb not null,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cie_r6_contact_decisions enable row level security;


create or replace function public.get_cie_r6_contact_authority_context(p_scheduler_run_id uuid,p_limit integer default 40)
returns table(opportunity_id uuid,reality_id text,commercial_routes jsonb,contacts jsonb)
language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.pipeline_scheduler_lease where singleton=true and run_id=p_scheduler_run_id and lease_expires_at>now())
  then raise exception 'PIPELINE_SCHEDULER_LEASE_NOT_HELD'; end if;
  return query
  select o.id,d.reality_id,
    coalesce((select jsonb_agg(jsonb_build_object(
      'id',r.id::text,'contactName',r.contact_name,'contactRole',r.contact_role,'targetRole',r.target_role,
      'channelType',r.channel_type,'channelValue',r.channel_value,'isViable',r.is_viable
    ) order by r.id) from public.commercial_routes r
      where r.organisation_id=o.organisation_id and r.campaign_id=o.campaign_id and r.company_id=o.company_id),'[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
      'id',c.id::text,'full_name',c.full_name,'role_title',c.role_title,'department',c.department,
      'email_address',c.email_address,'email_status',c.email_status,'linkedin_profile_url',c.linkedin_profile_url,
      'linkedin_status',c.linkedin_status,'review_status',c.review_status,
      'verified_identity_evidence',(select count(*) from public.contact_evidence e where e.contact_id=c.id and e.evidence_type='IDENTITY' and e.verified=true),
      'verified_role_evidence',(select count(*) from public.contact_evidence e where e.contact_id=c.id and e.evidence_type='ROLE' and e.verified=true)
    ) order by c.id) from public.contacts c
      where c.organisation_id=o.organisation_id and c.campaign_id=o.campaign_id and c.company_id=o.company_id),'[]'::jsonb)
  from public.opportunities o
  join public.cie_r4_commercial_decisions d on d.opportunity_id=o.id and d.disposition='COMMERCIAL_CANDIDATE'
  left join public.cie_r6_contact_decisions cd on cd.opportunity_id=o.id
  where o.status='BUILDING' and (cd.opportunity_id is null or cd.applied_at is null)
  order by o.created_at,o.id
  limit greatest(1,least(coalesce(p_limit,40),100));
end $$;
revoke all on function public.get_cie_r6_contact_authority_context(uuid,integer) from public,anon,authenticated;
grant execute on function public.get_cie_r6_contact_authority_context(uuid,integer) to service_role;

create or replace function public.persist_cie_r6_contact_decision(
  p_opportunity_id uuid,
  p_primary_contact_id uuid,
  p_contact_frontier_json jsonb,
  p_bindings_json jsonb,
  p_decision_json jsonb
) returns void language plpgsql security definer set search_path=public as $$
declare o public.opportunities%rowtype;
begin
  select * into o from public.opportunities where id=p_opportunity_id;
  if not found then raise exception 'CIE_R6_OPPORTUNITY_NOT_FOUND'; end if;
  if coalesce(p_decision_json->>'authorityMode','') <> 'AUTHORITATIVE' then raise exception 'CIE_R6_NON_AUTHORITATIVE_DECISION'; end if;
  if coalesce((p_decision_json->>'canUnlockOpportunity')::boolean,false) is not true then raise exception 'CIE_R6_CANNOT_UNLOCK'; end if;
  if p_primary_contact_id is not null and not exists(
    select 1 from public.contacts c where c.id=p_primary_contact_id and c.organisation_id=o.organisation_id and c.campaign_id=o.campaign_id and c.company_id=o.company_id
  ) then raise exception 'CIE_R6_CONTACT_SCOPE_MISMATCH'; end if;

  insert into public.cie_r6_contact_decisions(opportunity_id,organisation_id,campaign_id,primary_contact_id,contact_frontier_json,bindings_json,decision_json)
  values(o.id,o.organisation_id,o.campaign_id,p_primary_contact_id,coalesce(p_contact_frontier_json,'[]'::jsonb),coalesce(p_bindings_json,'[]'::jsonb),p_decision_json)
  on conflict(opportunity_id) do update set
    primary_contact_id=excluded.primary_contact_id,
    contact_frontier_json=excluded.contact_frontier_json,
    bindings_json=excluded.bindings_json,
    decision_json=excluded.decision_json,
    applied_at=null,
    updated_at=now();
end $$;

create or replace function public.apply_cie_r6_contact_authority()
returns table(applied integer,ready integer,organisational integer)
language plpgsql security definer set search_path=public as $$
declare r record; a integer:=0; rd integer:=0; org integer:=0;
begin
  for r in
    select d.*,r4.disposition from public.cie_r6_contact_decisions d
    join public.cie_r4_commercial_decisions r4 on r4.opportunity_id=d.opportunity_id
    where d.applied_at is null and r4.disposition='COMMERCIAL_CANDIDATE'
    order by d.created_at,d.opportunity_id
    for update of d skip locked
  loop
    -- By R6, both commercial disposition and route/contact authority have migrated.
    -- READY is therefore unlocked by categorical authority, never by a numeric score.
    update public.opportunities o set
      primary_contact_id=r.primary_contact_id,
      status='READY',
      opportunity_score=null,
      scoring_version='cie-r6-authoritative-commercial-route-contact',
      updated_at=now()
    where o.id=r.opportunity_id and o.status not in ('APPROVED','REJECTED','ENGAGED');

    update public.cie_r6_contact_decisions set applied_at=now(),updated_at=now() where opportunity_id=r.opportunity_id;
    a:=a+1; rd:=rd+1;
    if r.primary_contact_id is null then org:=org+1; end if;
  end loop;
  return query select a,rd,org;
end $$;

revoke all on function public.persist_cie_r6_contact_decision(uuid,uuid,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.persist_cie_r6_contact_decision(uuid,uuid,jsonb,jsonb,jsonb) to service_role;
revoke all on function public.apply_cie_r6_contact_authority() from public,anon,authenticated;
grant execute on function public.apply_cie_r6_contact_authority() to service_role;

comment on table public.cie_r6_contact_decisions is 'CIE-R6 authoritative contact binding. Primary contact is route-derived; weighted contact confidence is non-authoritative telemetry.';

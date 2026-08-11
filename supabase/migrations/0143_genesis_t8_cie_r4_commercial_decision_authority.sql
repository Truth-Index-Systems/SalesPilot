-- CIE-R4 Commercial Decision Authority.
-- Legacy opportunity scores remain historical/presentation data only.
create table if not exists public.cie_r4_commercial_decisions (
  opportunity_id uuid primary key references public.opportunities(id) on delete cascade,
  organisation_id uuid not null,
  campaign_id uuid not null,
  scheduler_run_id uuid,
  reality_id text not null,
  target_entity_id text not null,
  reality_state text not null check (reality_state in ('IMPOSSIBLE','DORMANT','EXPIRED','UNRESOLVED','CONTESTED','POSSIBLE','ESTABLISHED')),
  disposition text not null check (disposition in ('REJECT','HOLD_TEMPORAL','RESEARCH_REQUIRED','COMMERCIAL_CANDIDATE')),
  authority_mode text not null default 'AUTHORITATIVE' check (authority_mode='AUTHORITATIVE'),
  decision_json jsonb not null,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cie_r4_commercial_decisions enable row level security;

create or replace function public.persist_cie_r4_commercial_decision(
  p_scheduler_run_id uuid,
  p_opportunity_id uuid,
  p_reality_id text,
  p_target_entity_id text,
  p_reality_state text,
  p_disposition text,
  p_decision_json jsonb
) returns void language plpgsql security definer set search_path=public as $$
declare o public.opportunities%rowtype;
begin
  select * into o from public.opportunities where id=p_opportunity_id;
  if not found then raise exception 'CIE_R4_OPPORTUNITY_NOT_FOUND'; end if;
  if coalesce(p_decision_json->>'authorityMode','') <> 'AUTHORITATIVE' then raise exception 'CIE_R4_NON_AUTHORITATIVE_DECISION'; end if;
  if coalesce(p_decision_json->>'opportunityId','') <> p_opportunity_id::text then raise exception 'CIE_R4_OPPORTUNITY_ID_MISMATCH'; end if;
  if coalesce(p_decision_json->>'realityId','') <> p_reality_id then raise exception 'CIE_R4_REALITY_ID_MISMATCH'; end if;
  if coalesce(p_decision_json->>'targetEntityId','') <> p_target_entity_id then raise exception 'CIE_R4_TARGET_ID_MISMATCH'; end if;
  if coalesce(p_decision_json->>'realityState','') <> p_reality_state then raise exception 'CIE_R4_STATE_MISMATCH'; end if;
  if coalesce(p_decision_json->>'disposition','') <> p_disposition then raise exception 'CIE_R4_DISPOSITION_MISMATCH'; end if;
  if coalesce((p_decision_json->>'canUnlockEngagement')::boolean,true) then raise exception 'CIE_R4_MAY_NOT_UNLOCK_ENGAGEMENT'; end if;

  insert into public.cie_r4_commercial_decisions(opportunity_id,organisation_id,campaign_id,scheduler_run_id,reality_id,target_entity_id,reality_state,disposition,decision_json)
  values(p_opportunity_id,o.organisation_id,o.campaign_id,p_scheduler_run_id,p_reality_id,p_target_entity_id,p_reality_state,p_disposition,p_decision_json)
  on conflict(opportunity_id) do update set
    scheduler_run_id=excluded.scheduler_run_id,
    reality_id=excluded.reality_id,
    target_entity_id=excluded.target_entity_id,
    reality_state=excluded.reality_state,
    disposition=excluded.disposition,
    decision_json=excluded.decision_json,
    applied_at=null,
    updated_at=now();
end $$;

create or replace function public.apply_cie_r4_commercial_decision_authority(p_scheduler_run_id uuid)
returns table(applied integer,rejected integer,held integer,"researchRequired" integer,candidates integer)
language plpgsql security definer set search_path=public as $$
declare r record; a integer:=0; x integer:=0; h integer:=0; q integer:=0; c integer:=0;
begin
  for r in
    select d.* from public.cie_r4_commercial_decisions d
    where d.applied_at is null
    order by d.created_at, d.opportunity_id
    limit 100
    for update skip locked
  loop
    -- R4 owns only the commercial disposition. It deliberately cannot create
    -- READY/APPROVED/ENGAGED because route/contact authority migrate later.
    update public.opportunities o set
      status = case
        when r.disposition='REJECT' then 'LOW_PRIORITY'
        when r.disposition in ('HOLD_TEMPORAL','RESEARCH_REQUIRED') then 'NEEDS_EVIDENCE'
        else 'BUILDING'
      end,
      -- Historical numeric score is explicitly stripped of live authority.
      opportunity_score = null,
      scoring_version = 'cie-r4-authoritative-commercial-decision',
      updated_at = now()
    where o.id=r.opportunity_id;

    update public.cie_r4_commercial_decisions set applied_at=now(),updated_at=now(),scheduler_run_id=p_scheduler_run_id where opportunity_id=r.opportunity_id;
    a:=a+1;
    if r.disposition='REJECT' then x:=x+1;
    elsif r.disposition='HOLD_TEMPORAL' then h:=h+1;
    elsif r.disposition='RESEARCH_REQUIRED' then q:=q+1;
    else c:=c+1;
    end if;
  end loop;
  return query select a,x,h,q,c;
end $$;

revoke all on function public.persist_cie_r4_commercial_decision(uuid,uuid,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.persist_cie_r4_commercial_decision(uuid,uuid,text,text,text,text,jsonb) to service_role;
revoke all on function public.apply_cie_r4_commercial_decision_authority(uuid) from public,anon,authenticated;
grant execute on function public.apply_cie_r4_commercial_decision_authority(uuid) to service_role;

comment on table public.cie_r4_commercial_decisions is 'CIE-R4 authoritative commercial-decision ledger. CE2/UDOSIB owns disposition; MarketRoute consumes it. Legacy opportunity scoring has no authority.';

-- Foundation materialisation replacement. It creates identity/workflow shells
-- only; no route/contact/fit mathematics may unlock review.
create or replace function public.sync_cie_r4_opportunity_foundations(p_scheduler_run_id uuid)
returns table(created integer,updated integer,ranked integer,ready integer,"needsContact" integer)
language plpgsql security definer set search_path=public as $$
declare
  v_company record;
  v_existing public.opportunities%rowtype;
  v_created integer:=0;
  v_updated integer:=0;
  v_ranked integer:=0;
  v_opp_id uuid;
begin
  if not exists(select 1 from public.pipeline_scheduler_lease where singleton=true and run_id=p_scheduler_run_id and lease_expires_at>now())
  then raise exception 'PIPELINE_SCHEDULER_LEASE_NOT_HELD'; end if;

  for v_company in
    select co.* from public.companies co join public.campaigns ca on ca.id=co.campaign_id
    where co.review_status='APPROVED' and ca.status not in ('PAUSED','CANCELLED')
    order by co.campaign_id,co.created_at,co.id
    for update of co skip locked
  loop
    select * into v_existing from public.opportunities
    where organisation_id=v_company.organisation_id and campaign_id=v_company.campaign_id and company_id=v_company.id
    for update;

    if v_existing.id is null then
      insert into public.opportunities(organisation_id,campaign_id,company_id,primary_contact_id,status,rank,opportunity_score,scoring_version)
      values(v_company.organisation_id,v_company.campaign_id,v_company.id,null,'BUILDING',1,null,'cie-r4-awaiting-authoritative-decision')
      returning id into v_opp_id;
      v_created:=v_created+1;
      insert into public.opportunity_history(organisation_id,campaign_id,opportunity_id,event_type,next_status,next_rank,metadata_json)
      values(v_company.organisation_id,v_company.campaign_id,v_opp_id,'CREATED','BUILDING',1,jsonb_build_object('companyId',v_company.id,'schedulerRunId',p_scheduler_run_id,'authority','CIE-R4'));
    elsif v_existing.status not in ('APPROVED','REJECTED','ENGAGED') and
          (v_existing.status<>'BUILDING' or v_existing.opportunity_score is not null or coalesce(v_existing.scoring_version,'')<>'cie-r4-awaiting-authoritative-decision') then
      update public.opportunities set status='BUILDING',opportunity_score=null,scoring_version='cie-r4-awaiting-authoritative-decision',updated_at=now() where id=v_existing.id;
      v_updated:=v_updated+1;
    end if;
    v_existing:=null;
  end loop;

  -- Rank is now a canonical presentation order only, never an opportunity score.
  with ranked_rows as (
    select id,row_number() over(partition by organisation_id,campaign_id order by created_at,id)::integer as new_rank
    from public.opportunities
  ), changed as (
    update public.opportunities o set rank=r.new_rank,updated_at=case when o.rank<>r.new_rank then now() else o.updated_at end
    from ranked_rows r where o.id=r.id and o.rank<>r.new_rank returning o.id
  ) select count(*) into v_ranked from changed;

  return query select v_created,v_updated,v_ranked,0,0;
end $$;
revoke all on function public.sync_cie_r4_opportunity_foundations(uuid) from public,anon,authenticated;
grant execute on function public.sync_cie_r4_opportunity_foundations(uuid) to service_role;

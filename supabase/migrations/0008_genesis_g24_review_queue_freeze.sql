-- Genesis G2.4: production review queue, review history and campaign integration.

alter table public.companies
  add column if not exists review_note text,
  add column if not exists review_version integer not null default 0;

create table if not exists public.company_review_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  previous_status text,
  next_status text not null,
  note text,
  reviewed_by uuid not null,
  occurred_at timestamptz not null default now()
);

create index if not exists company_review_events_company_idx
  on public.company_review_events(organisation_id,company_id,occurred_at desc);
create index if not exists company_review_events_campaign_idx
  on public.company_review_events(organisation_id,campaign_id,occurred_at desc);

alter table public.company_review_events enable row level security;
drop policy if exists company_review_events_member_select on public.company_review_events;
create policy company_review_events_member_select on public.company_review_events
for select to authenticated using (
  exists (
    select 1 from public.organisation_memberships m
    where m.organisation_id=company_review_events.organisation_id
      and m.user_id=auth.uid() and m.status='ACTIVE'
  )
);

create or replace function public.review_salespilot_company(
  p_organisation_id uuid,
  p_company_id uuid,
  p_user_id uuid,
  p_status text,
  p_note text default null
) returns public.companies
language plpgsql security definer set search_path=public as $$
declare
  current_company public.companies%rowtype;
  updated_company public.companies%rowtype;
  membership_role text;
  event_title text;
  event_description text;
begin
  if p_status not in ('PENDING_REVIEW','APPROVED','REJECTED','ARCHIVED') then
    raise exception 'invalid review status';
  end if;

  select role into membership_role from public.organisation_memberships
  where organisation_id=p_organisation_id and user_id=p_user_id and status='ACTIVE' limit 1;
  if membership_role is null then raise exception 'membership required'; end if;
  if membership_role='VIEWER' then raise exception 'review forbidden'; end if;

  select * into current_company from public.companies
  where id=p_company_id and organisation_id=p_organisation_id for update;
  if current_company.id is null then raise exception 'company not found'; end if;

  if current_company.review_status=p_status and coalesce(current_company.review_note,'')=coalesce(nullif(trim(p_note),''),'') then
    return current_company;
  end if;

  update public.companies set
    review_status=p_status,
    review_note=nullif(trim(p_note),''),
    reviewed_at=now(),
    reviewed_by=p_user_id,
    review_version=review_version+1,
    updated_at=now()
  where id=current_company.id returning * into updated_company;

  insert into public.company_review_events(
    organisation_id,campaign_id,company_id,previous_status,next_status,note,reviewed_by
  ) values(
    p_organisation_id,current_company.campaign_id,current_company.id,
    current_company.review_status,p_status,nullif(trim(p_note),''),p_user_id
  );

  if p_status='APPROVED' then
    event_title:='Company approved';
    event_description:=updated_company.company_name||' was approved for the next stage.';
  elsif p_status='REJECTED' then
    event_title:='Company not selected';
    event_description:=updated_company.company_name||' was removed from this campaign review queue.';
  elsif p_status='ARCHIVED' then
    event_title:='Company archived';
    event_description:=updated_company.company_name||' was archived.';
  else
    event_title:='Company returned to review';
    event_description:=updated_company.company_name||' is awaiting another review.';
  end if;

  insert into public.campaign_timeline(
    organisation_id,campaign_id,event_type,title,description,visibility,metadata_json,occurred_at
  ) values(
    p_organisation_id,current_company.campaign_id,'COMPANY_REVIEWED',event_title,event_description,
    'CUSTOMER',jsonb_build_object('companyId',current_company.id,'reviewStatus',p_status),now()
  );

  return updated_company;
end $$;

revoke all on function public.review_salespilot_company(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.review_salespilot_company(uuid,uuid,uuid,text,text) to service_role;

create or replace function public.bulk_review_salespilot_companies(
  p_organisation_id uuid,
  p_company_ids uuid[],
  p_user_id uuid,
  p_status text,
  p_note text default null
) returns integer
language plpgsql security definer set search_path=public as $$
declare company_id uuid; changed integer:=0;
begin
  if coalesce(array_length(p_company_ids,1),0)>100 then raise exception 'bulk review limit exceeded'; end if;
  foreach company_id in array p_company_ids loop
    perform public.review_salespilot_company(p_organisation_id,company_id,p_user_id,p_status,p_note);
    changed:=changed+1;
  end loop;
  return changed;
end $$;
revoke all on function public.bulk_review_salespilot_companies(uuid,uuid[],uuid,text,text) from public,anon,authenticated;
grant execute on function public.bulk_review_salespilot_companies(uuid,uuid[],uuid,text,text) to service_role;

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
 coalesce((select jsonb_agg(jsonb_build_object(
   'id',r.id,'previous_status',r.previous_status,'next_status',r.next_status,
   'note',r.note,'occurred_at',r.occurred_at
 ) order by r.occurred_at desc) from public.company_review_events r where r.company_id=c.id),'[]'::jsonb) as review_history,
 coalesce((select v.payload_json from public.company_versions v where v.company_id=c.id order by version_number desc limit 1),'{}'::jsonb) as payload
from public.companies c join public.campaigns ca on ca.id=c.campaign_id;

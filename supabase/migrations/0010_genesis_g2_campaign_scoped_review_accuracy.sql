-- Genesis G2 correctness patch: enforce campaign-scoped review decisions and accurate review state.

create or replace function public.review_salespilot_company_scoped(
  p_organisation_id uuid,
  p_campaign_id uuid,
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

  select role into membership_role
  from public.organisation_memberships
  where organisation_id=p_organisation_id
    and user_id=p_user_id
    and status='ACTIVE'
  limit 1;

  if membership_role is null then raise exception 'membership required'; end if;
  if membership_role='VIEWER' then raise exception 'review forbidden'; end if;

  select * into current_company
  from public.companies
  where id=p_company_id
    and organisation_id=p_organisation_id
    and campaign_id=p_campaign_id
  for update;

  if current_company.id is null then
    raise exception 'campaign company not found';
  end if;

  if current_company.review_status=p_status
     and coalesce(current_company.review_note,'')=coalesce(nullif(trim(p_note),''),'') then
    return current_company;
  end if;

  update public.companies set
    review_status=p_status,
    review_note=nullif(trim(p_note),''),
    reviewed_at=now(),
    reviewed_by=p_user_id,
    review_version=review_version+1,
    updated_at=now()
  where id=current_company.id
    and campaign_id=p_campaign_id
  returning * into updated_company;

  insert into public.company_review_events(
    organisation_id,campaign_id,company_id,previous_status,next_status,note,reviewed_by
  ) values(
    p_organisation_id,p_campaign_id,current_company.id,
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
    p_organisation_id,p_campaign_id,'COMPANY_REVIEWED',event_title,event_description,
    'CUSTOMER',jsonb_build_object('companyId',current_company.id,'reviewStatus',p_status),now()
  );

  return updated_company;
end $$;

create or replace function public.bulk_review_salespilot_companies_scoped(
  p_organisation_id uuid,
  p_campaign_id uuid,
  p_company_ids uuid[],
  p_user_id uuid,
  p_status text,
  p_note text default null
) returns integer
language plpgsql security definer set search_path=public as $$
declare
  company_id uuid;
  changed integer:=0;
begin
  if coalesce(array_length(p_company_ids,1),0)>100 then
    raise exception 'bulk review limit exceeded';
  end if;

  foreach company_id in array p_company_ids loop
    perform public.review_salespilot_company_scoped(
      p_organisation_id,p_campaign_id,company_id,p_user_id,p_status,p_note
    );
    changed:=changed+1;
  end loop;

  return changed;
end $$;

revoke all on function public.review_salespilot_company_scoped(uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.bulk_review_salespilot_companies_scoped(uuid,uuid,uuid[],uuid,text,text) from public,anon,authenticated;
grant execute on function public.review_salespilot_company_scoped(uuid,uuid,uuid,uuid,text,text) to service_role;
grant execute on function public.bulk_review_salespilot_companies_scoped(uuid,uuid,uuid[],uuid,text,text) to service_role;

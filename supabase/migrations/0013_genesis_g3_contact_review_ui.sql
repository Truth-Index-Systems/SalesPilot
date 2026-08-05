-- Genesis G3 Step 3: campaign-scoped contact review actions for the contact review UI.
create or replace function public.review_salespilot_contact_scoped(
  p_organisation_id uuid,p_campaign_id uuid,p_contact_id uuid,p_user_id uuid,p_status text,p_note text default null
) returns public.contacts
language plpgsql security definer set search_path=public as $$
declare current_contact public.contacts%rowtype; updated_contact public.contacts%rowtype; membership_role text; event_title text; event_description text;
begin
  if p_status not in ('PENDING_REVIEW','APPROVED','REJECTED','HOLD','ARCHIVED') then raise exception 'invalid review status'; end if;
  select role into membership_role from public.organisation_memberships where organisation_id=p_organisation_id and user_id=p_user_id and status='ACTIVE' limit 1;
  if membership_role is null then raise exception 'membership required'; end if;
  if membership_role='VIEWER' then raise exception 'review forbidden'; end if;
  select * into current_contact from public.contacts where id=p_contact_id and organisation_id=p_organisation_id and campaign_id=p_campaign_id for update;
  if current_contact.id is null then raise exception 'campaign contact not found'; end if;
  if current_contact.review_status=p_status and coalesce(current_contact.review_note,'')=coalesce(nullif(trim(p_note),''),'') then return current_contact; end if;
  update public.contacts set review_status=p_status,review_note=nullif(trim(p_note),''),reviewed_at=now(),reviewed_by=p_user_id,review_version=review_version+1,updated_at=now()
  where id=current_contact.id and campaign_id=p_campaign_id returning * into updated_contact;
  insert into public.contact_review_events(organisation_id,campaign_id,company_id,contact_id,previous_status,next_status,note,reviewed_by)
  values(p_organisation_id,p_campaign_id,current_contact.company_id,current_contact.id,current_contact.review_status,p_status,nullif(trim(p_note),''),p_user_id);
  if p_status='APPROVED' then event_title:='Contact approved'; event_description:=updated_contact.full_name||' was approved for outreach.';
  elsif p_status='REJECTED' then event_title:='Contact not selected'; event_description:=updated_contact.full_name||' was removed from contact review.';
  elsif p_status='HOLD' then event_title:='Contact held'; event_description:=updated_contact.full_name||' was held for further evidence.';
  elsif p_status='ARCHIVED' then event_title:='Contact archived'; event_description:=updated_contact.full_name||' was archived.';
  else event_title:='Contact returned to review'; event_description:=updated_contact.full_name||' is awaiting another review.'; end if;
  insert into public.campaign_timeline(organisation_id,campaign_id,event_type,title,description,visibility,metadata_json,occurred_at)
  values(p_organisation_id,p_campaign_id,'CONTACT_REVIEWED',event_title,event_description,'CUSTOMER',jsonb_build_object('contactId',current_contact.id,'companyId',current_contact.company_id,'reviewStatus',p_status),now());
  if p_status='APPROVED' then perform public.enqueue_contact_domain_event(p_organisation_id,'ContactApproved',current_contact.id,jsonb_build_object('reviewStatus',p_status));
  elsif p_status='REJECTED' then perform public.enqueue_contact_domain_event(p_organisation_id,'ContactRejected',current_contact.id,jsonb_build_object('reviewStatus',p_status));
  elsif p_status='HOLD' then perform public.enqueue_contact_domain_event(p_organisation_id,'ContactHeld',current_contact.id,jsonb_build_object('reviewStatus',p_status)); end if;
  return updated_contact;
end $$;
create or replace function public.bulk_review_salespilot_contacts_scoped(p_organisation_id uuid,p_campaign_id uuid,p_contact_ids uuid[],p_user_id uuid,p_status text,p_note text default null) returns integer
language plpgsql security definer set search_path=public as $$ declare contact_id uuid; changed integer:=0; begin
 if coalesce(array_length(p_contact_ids,1),0)>100 then raise exception 'bulk review limit exceeded'; end if;
 foreach contact_id in array p_contact_ids loop perform public.review_salespilot_contact_scoped(p_organisation_id,p_campaign_id,contact_id,p_user_id,p_status,p_note); changed:=changed+1; end loop; return changed; end $$;
revoke all on function public.review_salespilot_contact_scoped(uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.bulk_review_salespilot_contacts_scoped(uuid,uuid,uuid[],uuid,text,text) from public,anon,authenticated;
grant execute on function public.review_salespilot_contact_scoped(uuid,uuid,uuid,uuid,text,text) to service_role;
grant execute on function public.bulk_review_salespilot_contacts_scoped(uuid,uuid,uuid[],uuid,text,text) to service_role;

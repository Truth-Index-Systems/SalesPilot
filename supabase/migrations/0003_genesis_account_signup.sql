create or replace function public.provision_salespilot_workspace(p_user_id uuid, p_name text, p_slug text)
returns uuid language plpgsql security definer set search_path=public as $$
declare existing_org uuid; new_org uuid;
begin
  if p_user_id is null or length(trim(p_name)) < 2 or length(trim(p_slug)) < 2 then raise exception 'invalid workspace provisioning request'; end if;
  select organisation_id into existing_org from public.organisation_memberships where user_id=p_user_id and status='ACTIVE' order by created_at asc limit 1;
  if existing_org is not null then return existing_org; end if;
  insert into public.organisations(name,slug) values(trim(p_name),lower(trim(p_slug))) returning id into new_org;
  insert into public.organisation_memberships(organisation_id,user_id,role,status) values(new_org,p_user_id,'OWNER','ACTIVE');
  return new_org;
end;
$$;
revoke all on function public.provision_salespilot_workspace(uuid,text,text) from public, anon, authenticated;
grant execute on function public.provision_salespilot_workspace(uuid,text,text) to service_role;

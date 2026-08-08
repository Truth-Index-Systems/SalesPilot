-- Genesis G2 campaign pause/resume/delete controls.

alter table public.campaigns drop constraint if exists campaigns_status_check;
alter table public.discovery_sessions drop constraint if exists discovery_sessions_status_check;
alter table public.discovery_sessions add constraint discovery_sessions_status_check
  check (status in ('QUEUED','RUNNING','COMPLETED','FAILED','CANCELLED','PAUSED'));

alter table public.campaigns add constraint campaigns_status_check
  check (status in ('DRAFT','PREPARING','READY','PAUSED','FAILED','ARCHIVED'));

create or replace function public.control_salespilot_campaign(
  p_campaign_id uuid,
  p_organisation_id uuid,
  p_user_id uuid,
  p_action text,
  p_confirmation text
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  c public.campaigns%rowtype;
  member_role text;
begin
  select role into member_role
  from public.organisation_memberships
  where organisation_id=p_organisation_id and user_id=p_user_id and status='ACTIVE'
  limit 1;

  if member_role not in ('OWNER','ADMIN') then
    raise exception 'campaign control forbidden';
  end if;

  select * into c from public.campaigns
  where id=p_campaign_id and organisation_id=p_organisation_id
  for update;

  if c.id is null then raise exception 'campaign not found'; end if;

  if p_action='PAUSE' then
    if p_confirmation <> 'pause' then raise exception 'confirmation mismatch'; end if;
    update public.campaigns set status='PAUSED',updated_at=now() where id=c.id;
    update public.discovery_sessions
      set status='PAUSED',updated_at=now(),lease_expires_at=null,next_attempt_at=null
      where campaign_id=c.id and status in ('QUEUED','RUNNING','FAILED');
    insert into public.campaign_timeline(organisation_id,campaign_id,event_type,title,description,visibility,metadata_json,occurred_at)
    values(c.organisation_id,c.id,'CAMPAIGN_PAUSED','Campaign paused','Autonomous campaign work has been paused. Saved progress remains available.','CUSTOMER','{}'::jsonb,now());
  elsif p_action='RESUME' then
    if p_confirmation <> 'resume' then raise exception 'confirmation mismatch'; end if;
    update public.campaigns set status='PREPARING',updated_at=now() where id=c.id;
    update public.discovery_sessions
      set status='QUEUED',stage='PREPARING',next_attempt_at=now(),updated_at=now(),last_error=null
      where campaign_id=c.id and status='PAUSED';
    insert into public.campaign_timeline(organisation_id,campaign_id,event_type,title,description,visibility,metadata_json,occurred_at)
    values(c.organisation_id,c.id,'CAMPAIGN_RESUMED','Campaign resumed','MarketRoute can continue autonomous work from the saved campaign state.','CUSTOMER','{}'::jsonb,now());
  elsif p_action='DELETE' then
    if p_confirmation <> c.name then raise exception 'confirmation mismatch'; end if;
    delete from public.campaigns where id=c.id and organisation_id=c.organisation_id;
  else
    raise exception 'invalid campaign action';
  end if;
end $$;

revoke all on function public.control_salespilot_campaign(uuid,uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.control_salespilot_campaign(uuid,uuid,uuid,text,text) to service_role;

create or replace function public.claim_company_discovery()
returns table(session_id uuid, organisation_id uuid, campaign_id uuid)
language plpgsql security definer set search_path=public as $$
declare claimed uuid;
begin
  update public.discovery_sessions s
  set status='FAILED',stage='PREPARING',last_error='WORKER_LEASE_EXPIRED',next_attempt_at=now(),lease_expires_at=null,updated_at=now()
  from public.campaigns c
  where s.campaign_id=c.id and c.status<>'PAUSED' and s.status='RUNNING'
    and s.lease_expires_at is not null and s.lease_expires_at < now() and s.attempt_count < 3;

  select s.id into claimed
  from public.discovery_sessions s
  join public.campaigns c on c.id=s.campaign_id
  where s.status in ('QUEUED','FAILED') and c.status<>'PAUSED'
    and s.attempt_count < 3 and (s.next_attempt_at is null or s.next_attempt_at <= now())
  order by s.created_at asc for update of s skip locked limit 1;

  if claimed is null then return; end if;
  update public.discovery_sessions set status='RUNNING',stage='SEARCHING',progress=greatest(progress,10),attempt_count=attempt_count+1,
    started_at=coalesce(started_at,now()),heartbeat_at=now(),lease_expires_at=now()+interval '10 minutes',next_attempt_at=null,last_error=null,updated_at=now()
  where id=claimed;
  return query select s.id,s.organisation_id,s.campaign_id from public.discovery_sessions s where s.id=claimed;
end $$;

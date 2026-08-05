-- Genesis G3.10: company-level outreach routes and organisation intelligence memory.
-- Extends person discovery with evidence-backed business inboxes and reply-learning hooks.

create table if not exists public.company_contact_channels (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  associated_contact_id uuid references public.contacts(id) on delete set null,
  email_address text not null,
  normalised_email text not null,
  channel_type text not null check (channel_type in ('NAMED','DEPARTMENTAL','GENERAL')),
  department text,
  likely_reader text not null,
  reason_selected text not null,
  verification_status text not null check (verification_status in ('PUBLIC_VERIFIED','PATTERN_LIKELY','INTERNAL_CONFIRMED')),
  confidence integer not null check (confidence between 0 and 100),
  routing_score integer not null check (routing_score between 0 and 100),
  response_likelihood integer not null check (response_likelihood between 0 and 100),
  campaign_relevance integer not null check (campaign_relevance between 0 and 100),
  source_url text not null,
  source_title text,
  evidence_excerpt text not null,
  is_primary boolean not null default false,
  deliverability_status text not null default 'UNCHECKED'
    check (deliverability_status in ('UNCHECKED','DELIVERABLE','CATCH_ALL','UNDELIVERABLE','BOUNCED')),
  last_successful_reply_at timestamptz,
  last_failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id,campaign_id,company_id,normalised_email)
);

create table if not exists public.contact_channel_history (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  channel_id uuid not null references public.company_contact_channels(id) on delete cascade,
  event_type text not null check (event_type in ('DISCOVERED','RANKED_PRIMARY','REPLY_RECEIVED','REFERRED','BOUNCED','SUPPRESSED','UPDATED')),
  payload_json jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create table if not exists public.contact_referrals (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  source_channel_id uuid references public.company_contact_channels(id) on delete set null,
  source_message_id text,
  referred_name text,
  referred_role text,
  referred_email text not null,
  referred_contact_id uuid references public.contacts(id) on delete set null,
  evidence_excerpt text not null,
  status text not null default 'PENDING_REVIEW' check (status in ('PENDING_REVIEW','APPROVED','REJECTED','APPLIED')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists public.organisation_intelligence_memory (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  memory_type text not null check (memory_type in ('PUBLIC_EMAIL','EMAIL_PATTERN','LINKEDIN_PROFILE','CONTACT_ROUTE','INTERNAL_REFERRAL','ROUTING_RESULT')),
  memory_key text not null,
  payload_json jsonb not null,
  source_scope text not null check (source_scope in ('PUBLIC','ORGANISATION_PRIVATE')),
  confidence integer not null default 0 check (confidence between 0 and 100),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz,
  unique (organisation_id,company_id,memory_type,memory_key)
);

create index if not exists company_contact_channels_rank_idx
  on public.company_contact_channels(organisation_id,campaign_id,company_id,is_primary desc,routing_score desc);
create index if not exists company_contact_channels_outreach_idx
  on public.company_contact_channels(organisation_id,campaign_id,is_primary,verification_status,routing_score desc);
create index if not exists contact_channel_history_channel_idx
  on public.contact_channel_history(organisation_id,channel_id,occurred_at desc);
create index if not exists contact_referrals_review_idx
  on public.contact_referrals(organisation_id,campaign_id,status,created_at desc);
create index if not exists intelligence_memory_company_idx
  on public.organisation_intelligence_memory(organisation_id,company_id,memory_type,last_seen_at desc);

alter table public.company_contact_channels enable row level security;
alter table public.contact_channel_history enable row level security;
alter table public.contact_referrals enable row level security;
alter table public.organisation_intelligence_memory enable row level security;

drop policy if exists company_contact_channels_member_read on public.company_contact_channels;
create policy company_contact_channels_member_read on public.company_contact_channels
for select to authenticated using (public.is_active_org_member(organisation_id));
drop policy if exists contact_channel_history_member_read on public.contact_channel_history;
create policy contact_channel_history_member_read on public.contact_channel_history
for select to authenticated using (public.is_active_org_member(organisation_id));
drop policy if exists contact_referrals_member_read on public.contact_referrals;
create policy contact_referrals_member_read on public.contact_referrals
for select to authenticated using (public.is_active_org_member(organisation_id));
drop policy if exists organisation_intelligence_memory_member_read on public.organisation_intelligence_memory;
create policy organisation_intelligence_memory_member_read on public.organisation_intelligence_memory
for select to authenticated using (public.is_active_org_member(organisation_id));

create or replace function public.save_company_contact_channels(p_session_id uuid,p_channels jsonb)
returns integer language plpgsql security definer set search_path=public as $$
declare
  s public.contact_discovery_sessions%rowtype;
  item jsonb;
  v_channel_id uuid;
  v_contact_id uuid;
  v_email text;
  v_saved integer:=0;
begin
  select * into s from public.contact_discovery_sessions where id=p_session_id for update;
  if s.id is null or s.status<>'RUNNING' then raise exception 'contact discovery session is not running'; end if;
  if jsonb_typeof(coalesce(p_channels,'[]'::jsonb))<>'array' then raise exception 'company channels payload must be an array'; end if;

  update public.company_contact_channels set is_primary=false,updated_at=now()
  where organisation_id=s.organisation_id and campaign_id=s.campaign_id and company_id=s.company_id;

  for item in select * from jsonb_array_elements(coalesce(p_channels,'[]'::jsonb)) loop
    v_email:=lower(trim(item->>'emailAddress'));
    if v_email is null or v_email='' or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then continue; end if;
    v_contact_id:=null;
    if nullif(item->>'associatedContactName','') is not null then
      select id into v_contact_id from public.contacts
      where organisation_id=s.organisation_id and campaign_id=s.campaign_id and company_id=s.company_id
        and normalised_name=lower(regexp_replace(trim(item->>'associatedContactName'),'[^a-z0-9]+','','gi'))
      order by overall_confidence desc limit 1;
    end if;

    insert into public.company_contact_channels(
      organisation_id,campaign_id,company_id,associated_contact_id,email_address,normalised_email,
      channel_type,department,likely_reader,reason_selected,verification_status,confidence,
      routing_score,response_likelihood,campaign_relevance,source_url,source_title,evidence_excerpt
    ) values(
      s.organisation_id,s.campaign_id,s.company_id,v_contact_id,v_email,v_email,
      item->>'channelType',nullif(item->>'department',''),item->>'likelyReader',item->>'reasonSelected',
      item->>'verificationStatus',(item->>'confidence')::integer,(item->>'routingScore')::integer,
      (item->>'responseLikelihood')::integer,(item->>'campaignRelevance')::integer,
      item->>'sourceUrl',nullif(item->>'sourceTitle',''),item->>'evidenceExcerpt'
    ) on conflict (organisation_id,campaign_id,company_id,normalised_email) do update set
      associated_contact_id=coalesce(excluded.associated_contact_id,public.company_contact_channels.associated_contact_id),
      email_address=excluded.email_address,channel_type=excluded.channel_type,department=excluded.department,
      likely_reader=excluded.likely_reader,reason_selected=excluded.reason_selected,
      verification_status=case when public.company_contact_channels.verification_status='INTERNAL_CONFIRMED' then 'INTERNAL_CONFIRMED' else excluded.verification_status end,
      confidence=greatest(public.company_contact_channels.confidence,excluded.confidence),
      routing_score=excluded.routing_score,response_likelihood=excluded.response_likelihood,
      campaign_relevance=excluded.campaign_relevance,source_url=excluded.source_url,
      source_title=excluded.source_title,evidence_excerpt=excluded.evidence_excerpt,updated_at=now()
    returning id into v_channel_id;

    insert into public.contact_channel_history(organisation_id,campaign_id,company_id,channel_id,event_type,payload_json)
    values(s.organisation_id,s.campaign_id,s.company_id,v_channel_id,'DISCOVERED',jsonb_build_object('sessionId',s.id,'verificationStatus',item->>'verificationStatus'));

    insert into public.organisation_intelligence_memory(
      organisation_id,company_id,memory_type,memory_key,payload_json,source_scope,confidence
    ) values(
      s.organisation_id,s.company_id,'PUBLIC_EMAIL',v_email,
      jsonb_build_object('emailAddress',v_email,'channelType',item->>'channelType','department',item->>'department','sourceUrl',item->>'sourceUrl','likelyReader',item->>'likelyReader'),
      'PUBLIC',(item->>'confidence')::integer
    ) on conflict (organisation_id,company_id,memory_type,memory_key) do update set
      payload_json=excluded.payload_json,confidence=greatest(public.organisation_intelligence_memory.confidence,excluded.confidence),last_seen_at=now();
    v_saved:=v_saved+1;
  end loop;

  with ranked as (
    select id,row_number() over(order by routing_score desc,response_likelihood desc,campaign_relevance desc,confidence desc,created_at) rn
    from public.company_contact_channels
    where organisation_id=s.organisation_id and campaign_id=s.campaign_id and company_id=s.company_id
      and deliverability_status not in ('UNDELIVERABLE','BOUNCED')
  )
  update public.company_contact_channels c set is_primary=(ranked.rn=1),updated_at=now()
  from ranked where c.id=ranked.id;

  insert into public.contact_channel_history(organisation_id,campaign_id,company_id,channel_id,event_type,payload_json)
  select s.organisation_id,s.campaign_id,s.company_id,id,'RANKED_PRIMARY',jsonb_build_object('sessionId',s.id,'routingScore',routing_score)
  from public.company_contact_channels
  where organisation_id=s.organisation_id and campaign_id=s.campaign_id and company_id=s.company_id and is_primary=true;

  return v_saved;
end $$;

-- G5 hook: apply a company-provided referral without losing the original route.
create or replace function public.apply_contact_referral(
  p_referral_id uuid,p_contact_id uuid default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare r public.contact_referrals%rowtype; v_channel_id uuid; v_email text;
begin
  select * into r from public.contact_referrals where id=p_referral_id for update;
  if r.id is null then raise exception 'referral not found'; end if;
  v_email:=lower(trim(r.referred_email));
  insert into public.company_contact_channels(
    organisation_id,campaign_id,company_id,associated_contact_id,email_address,normalised_email,
    channel_type,likely_reader,reason_selected,verification_status,confidence,routing_score,
    response_likelihood,campaign_relevance,source_url,evidence_excerpt,is_primary
  ) values(
    r.organisation_id,r.campaign_id,r.company_id,coalesce(p_contact_id,r.referred_contact_id),v_email,v_email,
    'NAMED',coalesce(r.referred_name,'Referred internal contact'),'Confirmed by a reply from the company',
    'INTERNAL_CONFIRMED',100,100,95,100,'internal-reply://'||r.id,r.evidence_excerpt,true
  ) on conflict (organisation_id,campaign_id,company_id,normalised_email) do update set
    associated_contact_id=coalesce(excluded.associated_contact_id,public.company_contact_channels.associated_contact_id),
    verification_status='INTERNAL_CONFIRMED',confidence=100,routing_score=100,response_likelihood=95,
    campaign_relevance=100,is_primary=true,updated_at=now()
  returning id into v_channel_id;
  update public.company_contact_channels set is_primary=false,updated_at=now()
  where organisation_id=r.organisation_id and campaign_id=r.campaign_id and company_id=r.company_id and id<>v_channel_id;
  update public.contact_referrals set status='APPLIED',referred_contact_id=coalesce(p_contact_id,referred_contact_id),reviewed_at=now() where id=r.id;
  insert into public.organisation_intelligence_memory(organisation_id,company_id,memory_type,memory_key,payload_json,source_scope,confidence)
  values(r.organisation_id,r.company_id,'INTERNAL_REFERRAL',v_email,jsonb_build_object('emailAddress',v_email,'name',r.referred_name,'role',r.referred_role,'referralId',r.id),'ORGANISATION_PRIVATE',100)
  on conflict (organisation_id,company_id,memory_type,memory_key) do update set payload_json=excluded.payload_json,confidence=100,last_seen_at=now();
  return v_channel_id;
end $$;

revoke all on function public.save_company_contact_channels(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.apply_contact_referral(uuid,uuid) from public,anon,authenticated;
grant execute on function public.save_company_contact_channels(uuid,jsonb),public.apply_contact_referral(uuid,uuid) to service_role;

-- Completed G3 sessions created before route intelligence are queued once for enrichment.
update public.contact_discovery_sessions s
set status='QUEUED',stage='PREPARING',progress=0,last_error=null,next_attempt_at=now(),
    completed_at=null,lease_expires_at=null,updated_at=now()
where s.status='COMPLETED'
  and exists(select 1 from public.companies c where c.id=s.company_id and c.review_status='APPROVED')
  and not exists(
    select 1 from public.company_contact_channels ch
    where ch.organisation_id=s.organisation_id and ch.campaign_id=s.campaign_id and ch.company_id=s.company_id
  );

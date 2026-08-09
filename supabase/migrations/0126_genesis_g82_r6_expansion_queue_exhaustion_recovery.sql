-- Genesis G8.2 R6 — Expansion Queue Exhaustion Recovery
-- Prevents exhausted QUEUED/expired CLAIMED jobs from permanently blocking
-- autonomous industry expansion. Truth/evidence architecture is unchanged.

create or replace function public.ensure_genesis_g82_expansion_backlog(p_limit integer default 1)
returns table(job_id uuid, industry_key text, industry_name text)
language plpgsql security definer set search_path=public as $$
declare
  r record;
  v_job uuid;
  v_cycle text := to_char((now() at time zone 'utc'), 'YYYYMMDDHH24MI');
begin
  -- R6: terminalise jobs that can never be claimed again. Previously these
  -- remained QUEUED at attempt_count >= 8 and blocked their target forever.
  update public.genesis_g82_expansion_jobs j
  set status='FAILED',
      last_error=coalesce(nullif(j.last_error,''),'GENESIS_G82_EXPANSION_ATTEMPTS_EXHAUSTED'),
      lease_token=null,
      lease_expires_at=null,
      worker_id=null,
      updated_at=now()
  where j.attempt_count >= 8
    and (
      j.status='QUEUED'
      or (j.status='CLAIMED' and (j.lease_expires_at is null or j.lease_expires_at < now()))
    );

  for r in
    select t.*,
      count(m.entity_id) filter (where m.entity_type='company')::integer as company_count
    from public.genesis_g82_expansion_targets t
    left join public.genesis_g82_expansion_membership m on m.target_id=t.id
    where t.enabled=true
      and not exists (
        select 1
        from public.genesis_g82_expansion_jobs j
        where j.target_id=t.id
          and (
            (j.status='QUEUED' and j.attempt_count < 8)
            or (j.status='CLAIMED' and (j.lease_expires_at is null or j.lease_expires_at >= now()))
          )
      )
    group by t.id
    having count(m.entity_id) filter (where m.entity_type='company') < t.target_company_count
    order by
      (count(m.entity_id) filter (where m.entity_type='company')::numeric / greatest(t.target_company_count,1)) asc,
      t.priority desc,
      t.industry_key asc
    limit greatest(1,least(coalesce(p_limit,1),10))
  loop
    insert into public.genesis_g82_expansion_jobs(
      target_id,industry_key,industry_name,cycle_key,excluded_domains
    ) values (
      r.id,r.industry_key,r.display_name,
      v_cycle || ':' || replace(r.industry_key,'-','_'),
      coalesce((
        select jsonb_agg(x.canonical_domain order by x.created_at desc)
        from (
          select canonical_domain, created_at
          from public.genesis_g82_expansion_membership
          where target_id=r.id and entity_type='company' and canonical_domain is not null
          order by created_at desc limit 250
        ) x
      ),'[]'::jsonb)
    ) on conflict(target_id,cycle_key) do nothing
    returning id into v_job;

    if v_job is not null then
      job_id:=v_job;
      industry_key:=r.industry_key;
      industry_name:=r.display_name;
      return next;
    end if;
  end loop;
end $$;

create or replace function public.claim_genesis_g82_expansion_jobs(
  p_limit integer default 1,
  p_worker_id text default null,
  p_lease_seconds integer default 150
)
returns setof public.genesis_g82_expansion_jobs
language plpgsql security definer set search_path=public as $$
begin
  -- Defensive cleanup even if claim is called without ensure first.
  update public.genesis_g82_expansion_jobs j
  set status='FAILED',
      last_error=coalesce(nullif(j.last_error,''),'GENESIS_G82_EXPANSION_ATTEMPTS_EXHAUSTED'),
      lease_token=null,
      lease_expires_at=null,
      worker_id=null,
      updated_at=now()
  where j.attempt_count >= 8
    and (
      j.status='QUEUED'
      or (j.status='CLAIMED' and (j.lease_expires_at is null or j.lease_expires_at < now()))
    );

  return query
  with candidates as (
    select j.id
    from public.genesis_g82_expansion_jobs j
    where (
      j.status='QUEUED'
      or (j.status='CLAIMED' and j.lease_expires_at < now())
    )
      and j.attempt_count < 8
    order by j.created_at asc
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,1),4))
  ), updated as (
    update public.genesis_g82_expansion_jobs j
    set status='CLAIMED',
        attempt_count=j.attempt_count+1,
        lease_token=gen_random_uuid(),
        lease_expires_at=now()+make_interval(secs=>greatest(30,least(coalesce(p_lease_seconds,150),300))),
        worker_id=p_worker_id,
        updated_at=now()
    from candidates c
    where j.id=c.id
    returning j.*
  )
  select * from updated;
end $$;

revoke all on function public.ensure_genesis_g82_expansion_backlog(integer) from public, anon, authenticated;
revoke all on function public.claim_genesis_g82_expansion_jobs(integer,text,integer) from public, anon, authenticated;
grant execute on function public.ensure_genesis_g82_expansion_backlog(integer) to service_role;
grant execute on function public.claim_genesis_g82_expansion_jobs(integer,text,integer) to service_role;

notify pgrst, 'reload schema';

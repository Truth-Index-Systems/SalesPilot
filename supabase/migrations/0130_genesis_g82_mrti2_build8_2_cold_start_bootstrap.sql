-- MR-TI-2 Build 8.2 — Genesis Cold-Start Bootstrap
-- Makes autonomous expansion self-healing after a complete generated-intelligence reset.
-- Expansion targets are bootstrap configuration, not disposable intelligence.

create or replace function public.ensure_genesis_g82_expansion_backlog(p_limit integer default 1)
returns table(job_id uuid, industry_key text, industry_name text)
language plpgsql security definer set search_path=public as $$
declare
  r record;
  v_job uuid;
  v_cycle text := to_char((now() at time zone 'utc'), 'YYYYMMDDHH24MI');
begin
  -- Build 8.2: cold-start/self-heal the canonical expansion target catalogue.
  -- This deliberately runs inside the existing backlog RPC so a brand-new or
  -- intentionally wiped intelligence database can recover without manual seed SQL.
  insert into public.genesis_g82_expansion_targets(
    industry_key, display_name, priority, target_company_count, enabled
  ) values
    ('software','Software & SaaS',100,10000,true),
    ('professional-services','Professional Services',95,8000,true),
    ('marketing','Marketing & Advertising',90,7000,true),
    ('recruitment','Recruitment & HR',90,7000,true),
    ('finance','Finance & FinTech',85,7000,true),
    ('healthcare','Healthcare & HealthTech',85,7000,true),
    ('retail','Retail & E-commerce',80,7000,true),
    ('manufacturing','Manufacturing',80,7000,true),
    ('logistics','Logistics & Supply Chain',80,7000,true),
    ('construction','Construction & PropTech',75,6000,true)
  on conflict(industry_key) do nothing;

  -- Preserve R6 exhaustion recovery.
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
    v_job := null;

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

revoke all on function public.ensure_genesis_g82_expansion_backlog(integer) from public, anon, authenticated;
grant execute on function public.ensure_genesis_g82_expansion_backlog(integer) to service_role;

comment on function public.ensure_genesis_g82_expansion_backlog(integer) is
  'MR-TI-2 Build 8.2: self-heals canonical expansion targets and replenishes autonomous expansion jobs after cold start or intelligence reset.';

notify pgrst, 'reload schema';

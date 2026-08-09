-- Genesis G8.2 R2 — Founder Review UX, Activity Feed & Industry Research Coverage
-- Read-only founder aggregate. Does not change Truth mathematics or autonomous execution.

create or replace function public.genesis_g82_founder_operations_snapshot(p_since timestamptz default now() - interval '7 days')
returns jsonb
language sql
security definer
set search_path=public
as $$
with membership_counts as (
  select target_id,
    count(distinct entity_id) filter(where entity_type='company')::int companies_researched,
    count(distinct entity_id) filter(where entity_type='contact')::int contacts_researched,
    count(distinct entity_id) filter(where entity_type='route')::int routes_researched,
    max(created_at) last_membership_activity
  from public.genesis_g82_expansion_membership group by target_id
), job_counts as (
  select target_id,
    count(*) filter(where status='COMPLETED')::int completed_jobs,
    coalesce(sum(companies_found) filter(where status='COMPLETED'),0)::int companies_found,
    coalesce(sum(companies_persisted) filter(where status='COMPLETED'),0)::int companies_persisted,
    coalesce(sum(contacts_persisted) filter(where status='COMPLETED'),0)::int contacts_persisted,
    coalesce(sum(routes_persisted) filter(where status='COMPLETED'),0)::int routes_persisted,
    max(coalesce(completed_at,updated_at,created_at)) last_job_activity
  from public.genesis_g82_expansion_jobs group by target_id
), industry as (
  select t.id,t.industry_key,t.display_name,t.priority,t.target_company_count,t.enabled,
    coalesce(m.companies_researched,0) companies_researched,coalesce(m.contacts_researched,0) contacts_researched,coalesce(m.routes_researched,0) routes_researched,
    coalesce(j.completed_jobs,0) completed_jobs,coalesce(j.companies_found,0) companies_found,coalesce(j.companies_persisted,0) companies_persisted,
    coalesce(j.contacts_persisted,0) contacts_persisted,coalesce(j.routes_persisted,0) routes_persisted,
    greatest(m.last_membership_activity,j.last_job_activity) last_activity
  from public.genesis_g82_expansion_targets t
  left join membership_counts m on m.target_id=t.id
  left join job_counts j on j.target_id=t.id
), activity_union as (
  select coalesce(j.completed_at,j.updated_at,j.created_at) occurred_at,'EXPANSION'::text kind,
    j.industry_name title,
    concat('Found ',j.companies_found,' companies · persisted ',j.companies_persisted,' companies, ',j.contacts_persisted,' contacts, ',j.routes_persisted,' routes') detail,
    j.status status,
    j.id::text ref_id
  from public.genesis_g82_expansion_jobs j where coalesce(j.completed_at,j.updated_at,j.created_at)>=p_since
  union all
  select coalesce(q.completed_at,q.updated_at,q.created_at),'REPAIR',coalesce(e.display_name,e.canonical_key,q.claim_key),
    concat(q.claim_key,' · ',replace(q.repair_mode,'_',' ')),q.status,q.id::text
  from public.genesis_g8_discovery_repair_queue q
  join public.genesis_g8_intelligence_entities e on e.id=q.entity_id
  where coalesce(q.completed_at,q.updated_at,q.created_at)>=p_since
  union all
  select ev.created_at,'EVIDENCE',coalesce(e.display_name,e.canonical_key,c.label),
    concat(c.label,' · ',ev.direction,' · ',replace(ev.source_class,'_',' ')),ev.intelligence_channel,ev.id::text
  from public.genesis_g8_intelligence_evidence ev
  join public.genesis_g8_intelligence_claims c on c.id=ev.claim_id
  join public.genesis_g8_intelligence_entities e on e.id=c.entity_id
  where ev.created_at>=p_since
  union all
  select r.reviewed_at,'REVIEW',coalesce(e.display_name,e.canonical_key),concat(r.action,coalesce(' · '||nullif(r.note,''),'')),r.action,r.id::text
  from public.genesis_g8_human_review_receipts r
  join public.genesis_g8_intelligence_entities e on e.id=r.entity_id
  where r.reviewed_at>=p_since
), activity as (
  select * from activity_union order by occurred_at desc limit 40
)
select jsonb_build_object(
  'industryResearch',coalesce((select jsonb_agg(jsonb_build_object(
    'id',i.id,'industryKey',i.industry_key,'name',i.display_name,'priority',i.priority,'targetCompanyCount',i.target_company_count,'enabled',i.enabled,
    'companiesResearched',i.companies_researched,'contactsResearched',i.contacts_researched,'routesResearched',i.routes_researched,
    'completedJobs',i.completed_jobs,'companiesFound',i.companies_found,'companiesPersisted',i.companies_persisted,
    'contactsPersisted',i.contacts_persisted,'routesPersisted',i.routes_persisted,'lastActivity',i.last_activity,
    'progressPercent',round(least(100,(i.companies_researched::numeric/greatest(i.target_company_count,1))*100),2)
  ) order by i.priority desc,i.industry_key) from industry i),'[]'::jsonb),
  'activity',coalesce((select jsonb_agg(jsonb_build_object('occurredAt',a.occurred_at,'kind',a.kind,'title',a.title,'detail',a.detail,'status',a.status,'refId',a.ref_id) order by a.occurred_at desc) from activity a),'[]'::jsonb)
);
$$;

revoke all on function public.genesis_g82_founder_operations_snapshot(timestamptz) from public,anon,authenticated;
grant execute on function public.genesis_g82_founder_operations_snapshot(timestamptz) to service_role;
comment on function public.genesis_g82_founder_operations_snapshot(timestamptz) is 'Read-only founder operations snapshot: G8.2 expansion counts per industry and recent Genesis activity.';
notify pgrst, 'reload schema';

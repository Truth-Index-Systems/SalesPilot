-- Genesis G8.2 R3 — Review resolver hardening + expansion throughput
-- Fixes founder review RPC ambiguity and preserves immutable review semantics.
-- Does not change Truth mathematics. Expansion throughput is implemented in code only.

alter table public.genesis_g8_founder_review_queue
  add column if not exists resolution_action text,
  add column if not exists resolution_reason_code text,
  add column if not exists resolution_note text,
  add column if not exists resolution_correction_json jsonb,
  add column if not exists resolution_receipt_id uuid,
  add column if not exists resolution_actor text;

alter table public.genesis_g8_human_review_receipts
  add column if not exists review_task_id uuid references public.genesis_g8_founder_review_queue(id) on delete set null;

create unique index if not exists genesis_g8_review_receipt_task_unique
  on public.genesis_g8_human_review_receipts(review_task_id)
  where review_task_id is not null;

create index if not exists genesis_g8_founder_review_resolved_idx
  on public.genesis_g8_founder_review_queue(status,resolved_at desc);

create or replace function public.resolve_genesis_g8_founder_review(
  p_review_task_id uuid,
  p_action text,
  p_reason_code text default null,
  p_note text default null,
  p_correction jsonb default null,
  p_resolution_actor text default 'FOUNDER_DASHBOARD'
) returns table(
  review_task_id uuid,
  entity_id uuid,
  entity_type text,
  action text,
  receipt_id uuid,
  created boolean,
  claim_keys_json jsonb,
  reasons_json jsonb
)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_task public.genesis_g8_founder_review_queue%rowtype;
  v_receipt_id uuid;
  v_snapshot_id uuid;
  v_created boolean := false;
  v_review_state text;
  v_entity_status text;
begin
  if p_action not in ('APPROVE','CORRECT','REJECT','MORE_RESEARCH') then
    raise exception 'GENESIS_G8_INVALID_REVIEW_ACTION';
  end if;

  if p_action='CORRECT'
     and nullif(trim(coalesce(p_note,'')),'') is null
     and coalesce(p_correction,'{}'::jsonb)='{}'::jsonb then
    raise exception 'GENESIS_G8_CORRECTION_REQUIRED';
  end if;

  select q.*
    into v_task
    from public.genesis_g8_founder_review_queue q
   where q.id=p_review_task_id
   for update;

  if v_task.id is null then
    raise exception 'GENESIS_G8_REVIEW_TASK_NOT_FOUND';
  end if;

  if v_task.status='RESOLVED' then
    return query
      select v_task.id,
             v_task.entity_id,
             v_task.entity_type,
             coalesce(v_task.resolution_action,p_action),
             v_task.resolution_receipt_id,
             false,
             v_task.claim_keys_json,
             v_task.reasons_json;
    return;
  end if;

  if v_task.status<>'OPEN' then
    raise exception 'GENESIS_G8_REVIEW_TASK_NOT_OPEN';
  end if;

  select s.id
    into v_snapshot_id
    from public.genesis_g8_truth_snapshots s
   where s.entity_id=v_task.entity_id
   order by s.calculated_at desc,s.created_at desc
   limit 1;

  v_review_state := case p_action
    when 'APPROVE' then 'HUMAN_APPROVED'
    when 'CORRECT' then 'HUMAN_CORRECTED'
    when 'REJECT' then 'HUMAN_REJECTED'
    else 'UNREVIEWED'
  end;
  v_entity_status := case when p_action='REJECT' then 'SUPPRESSED' else 'ACTIVE' end;

  update public.genesis_g8_intelligence_entities e
     set review_state=v_review_state,
         status=v_entity_status,
         updated_at=now()
   where e.id=v_task.entity_id;

  insert into public.genesis_g8_human_review_receipts(
    entity_id,action,reason_code,note,correction_json,reviewer_user_id,truth_snapshot_id,review_task_id
  ) values (
    v_task.entity_id,
    p_action,
    nullif(trim(coalesce(p_reason_code,'')),''),
    nullif(trim(coalesce(p_note,'')),''),
    p_correction,
    null,
    v_snapshot_id,
    v_task.id
  )
  on conflict do nothing
  returning genesis_g8_human_review_receipts.id into v_receipt_id;

  if v_receipt_id is not null then
    v_created := true;
  else
    select r.id
      into v_receipt_id
      from public.genesis_g8_human_review_receipts r
     where r.review_task_id=v_task.id
     order by r.reviewed_at desc,r.created_at desc
     limit 1;
  end if;

  if v_receipt_id is null then
    raise exception 'GENESIS_G8_REVIEW_RECEIPT_NOT_PERSISTED';
  end if;

  update public.genesis_g8_founder_review_queue q
     set status='RESOLVED',
         resolution_action=p_action,
         resolution_reason_code=nullif(trim(coalesce(p_reason_code,'')),''),
         resolution_note=nullif(trim(coalesce(p_note,'')),''),
         resolution_correction_json=p_correction,
         resolution_receipt_id=v_receipt_id,
         resolution_actor=coalesce(nullif(trim(coalesce(p_resolution_actor,'')),''),'FOUNDER_DASHBOARD'),
         resolved_at=now(),
         updated_at=now()
   where q.id=v_task.id;

  if p_action='REJECT' then
    update public.genesis_g8_discovery_repair_queue q
       set status='CANCELLED',
           last_error='FOUNDER_REJECTED_ENTITY',
           updated_at=now()
     where q.entity_id=v_task.entity_id
       and q.status='QUEUED';
  end if;

  return query
    select v_task.id,
           v_task.entity_id,
           v_task.entity_type,
           p_action,
           v_receipt_id,
           v_created,
           v_task.claim_keys_json,
           v_task.reasons_json;
end
$$;

revoke all on function public.resolve_genesis_g8_founder_review(uuid,text,text,text,jsonb,text)
  from public,anon,authenticated;
grant execute on function public.resolve_genesis_g8_founder_review(uuid,text,text,text,jsonb,text)
  to service_role;

comment on function public.resolve_genesis_g8_founder_review(uuid,text,text,text,jsonb,text) is
'G8.2 R3 hardened founder-review resolver. Fully qualified SQL removes PL/pgSQL output-column ambiguity while preserving idempotent immutable review receipts and Truth separation.';

notify pgrst, 'reload schema';

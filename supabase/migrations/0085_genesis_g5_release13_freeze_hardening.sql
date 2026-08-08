-- MarketRoute Genesis G5 — Release 13: Freeze Hardening
-- No new product capability. Removes legacy engagement authority, repairs the R2 retry path,
-- and hardens terminal execution ownership before G5 is frozen.

-- 1) R2 gets a stage-specific claim. This prevents FAILED_RETRYABLE rows from other
-- stages being stolen by the generic state-machine claimant and repairs stranded
-- COMMERCIAL_REASONING retries.
create or replace function public.claim_g5_commercial_reasoning(
  p_scheduler_run_id uuid,
  p_lease_seconds integer default 180
)
returns table(strategy_id uuid, lease_token uuid, opportunity_id uuid, source_engagement_id uuid)
language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_token uuid:=gen_random_uuid();
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);

  select s.id into v_id
  from public.engagement_strategies s
  join public.opportunities o on o.id=s.opportunity_id and o.status='APPROVED'
  join public.campaigns c on c.id=s.campaign_id and c.organisation_id=s.organisation_id
    and c.status not in ('PAUSED','ARCHIVED')
  where (
      s.state='WAITING'
      or (
        s.state='FAILED_RETRYABLE'
        and s.failure_stage='COMMERCIAL_REASONING'
        and s.previous_state='REASONING'
        and coalesce(s.next_retry_at,now())<=now()
      )
    )
    and (s.lease_expires_at is null or s.lease_expires_at<now())
  order by case when s.state='FAILED_RETRYABLE' then 0 else 1 end,s.updated_at,s.created_at
  for update of s skip locked
  limit 1;

  if v_id is null then return; end if;

  update public.engagement_strategies s set
    previous_state=case when s.state='FAILED_RETRYABLE' then 'REASONING' else s.state end,
    state='REASONING',scheduler_run_id=p_scheduler_run_id,lease_token=v_token,
    claimed_at=now(),lease_expires_at=now()+make_interval(secs=>greatest(30,p_lease_seconds)),
    attempt_count=s.attempt_count+1,failure_stage=null,failure_reason=null,next_retry_at=null,updated_at=now()
  where s.id=v_id;

  insert into public.engagement_strategy_events(
    organisation_id,campaign_id,strategy_id,opportunity_id,scheduler_run_id,event_type,
    previous_state,next_state,lease_token,metadata_json
  )
  select s.organisation_id,s.campaign_id,s.id,s.opportunity_id,p_scheduler_run_id,'CLAIMED',
    case when s.previous_state='REASONING' then 'FAILED_RETRYABLE' else 'WAITING' end,
    'REASONING',v_token,jsonb_build_object('release','G5_R13','worker','COMMERCIAL_REASONING','stageSpecificRetry',true)
  from public.engagement_strategies s where s.id=v_id;

  return query
  select s.id,v_token,s.opportunity_id,s.source_engagement_id
  from public.engagement_strategies s where s.id=v_id;
end $$;

revoke all on function public.claim_g5_commercial_reasoning(uuid,integer) from public,anon,authenticated;
grant execute on function public.claim_g5_commercial_reasoning(uuid,integer) to service_role;

-- 2) Disable the obsolete G4 human engagement control plane. G5 Opportunity review
-- is the only mutable engagement surface after the immutable G4 boundary.
do $$
begin
  if to_regprocedure('public.review_engagement_draft(uuid,uuid,uuid,text,text,text,text,text,text,text)') is not null then
    execute 'revoke execute on function public.review_engagement_draft(uuid,uuid,uuid,text,text,text,text,text,text,text) from authenticated,service_role';
  end if;
  if to_regprocedure('public.bulk_review_engagement_drafts(uuid,uuid[],uuid,text,text)') is not null then
    execute 'revoke execute on function public.bulk_review_engagement_drafts(uuid,uuid[],uuid,text,text) from authenticated,service_role';
  end if;
  if to_regprocedure('public.record_engagement_execution(uuid,uuid,uuid,text,jsonb)') is not null then
    execute 'revoke execute on function public.record_engagement_execution(uuid,uuid,uuid,text,jsonb) from authenticated,service_role';
  end if;
  if to_regprocedure('public.record_engagement_outcome(uuid,uuid,uuid,text,text,numeric)') is not null then
    execute 'revoke execute on function public.record_engagement_outcome(uuid,uuid,uuid,text,text,numeric) from authenticated,service_role';
  end if;
  if to_regprocedure('public.run_engagement_queue_builder_owned(uuid)') is not null then
    execute 'revoke execute on function public.run_engagement_queue_builder_owned(uuid) from service_role';
  end if;
end $$;

-- 3) A successful transport completion may record SENT only if the strategy itself
-- is still QUEUED. This prevents a stale execution row from manufacturing a SENT event.
create or replace function public.complete_g5_email_execution_owned(
  p_queue_id uuid,p_scheduler_run_id uuid,p_lease_token uuid,p_transport_message_id text
)
returns void language plpgsql security definer set search_path=public as $$
declare q public.g5_engagement_execution_queue%rowtype; v_updated integer;
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
  select * into q from public.g5_engagement_execution_queue where id=p_queue_id for update;
  if q.id is null then raise exception 'G5_EXECUTION_MISSING'; end if;
  if q.status<>'SENDING' or q.scheduler_run_id is distinct from p_scheduler_run_id
     or q.lease_token is distinct from p_lease_token or q.lease_expires_at is null or q.lease_expires_at<now() then
    raise exception 'G5_EXECUTION_OWNERSHIP_LOST';
  end if;
  if not exists(select 1 from public.engagement_strategies s where s.id=q.strategy_id and s.state='QUEUED') then
    raise exception 'G5_EXECUTION_STRATEGY_NOT_QUEUED';
  end if;

  update public.g5_engagement_execution_queue set
    status='SENT',transport_message_id=nullif(trim(coalesce(p_transport_message_id,'')),''),sent_at=now(),
    lease_token=null,lease_expires_at=null,claimed_at=null,scheduler_run_id=null,next_retry_at=null,last_error=null,updated_at=now()
  where id=q.id;

  update public.engagement_strategies set previous_state='QUEUED',state='SENT',completed_at=now(),updated_at=now()
  where id=q.strategy_id and state='QUEUED';
  get diagnostics v_updated=row_count;
  if v_updated<>1 then raise exception 'G5_EXECUTION_STRATEGY_STATE_CHANGED'; end if;

  insert into public.engagement_strategy_events(organisation_id,campaign_id,strategy_id,opportunity_id,scheduler_run_id,event_type,previous_state,next_state,metadata_json)
  values(q.organisation_id,q.campaign_id,q.strategy_id,q.opportunity_id,p_scheduler_run_id,'TRANSITIONED','QUEUED','SENT',
    jsonb_build_object('release','G5_R13','queueId',q.id,'transportMessageId',p_transport_message_id,'transportFailureRegeneratesContent',false,'stateFenced',true));
  insert into public.campaign_timeline(organisation_id,campaign_id,event_type,title,description,visibility,metadata_json)
  values(q.organisation_id,q.campaign_id,'G5_ENGAGEMENT_SENT','Outreach sent','The approved first-touch outreach has been sent in the recipient’s permitted local-time window.','CUSTOMER',
    jsonb_build_object('strategyId',q.strategy_id,'opportunityId',q.opportunity_id,'channel','EMAIL','recipientTimezone',q.recipient_timezone));
end $$;

revoke all on function public.complete_g5_email_execution_owned(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.complete_g5_email_execution_owned(uuid,uuid,uuid,text) to service_role;

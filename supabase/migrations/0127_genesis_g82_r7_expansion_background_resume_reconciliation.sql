-- Genesis G8.2 R7 — Expansion background resume identity & ledger reconciliation.
-- Pending provider work is not a failed research attempt. Release the lease and
-- restore the attempt counter so the next heartbeat resumes the SAME durable
-- OpenAI checkpoint rather than deriving a new attempt identity.

create or replace function public.settle_genesis_g82_expansion_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_status text,
  p_companies_found integer default 0,
  p_companies_persisted integer default 0,
  p_contacts_persisted integer default 0,
  p_routes_persisted integer default 0,
  p_error text default null
)
returns void language plpgsql security definer set search_path=public as $$
begin
  if p_status not in ('QUEUED','COMPLETED','FAILED') then raise exception 'GENESIS_G82_INVALID_EXPANSION_STATUS'; end if;
  update public.genesis_g82_expansion_jobs
  set status=p_status,
      companies_found=greatest(0,coalesce(p_companies_found,0)),
      companies_persisted=greatest(0,coalesce(p_companies_persisted,0)),
      contacts_persisted=greatest(0,coalesce(p_contacts_persisted,0)),
      routes_persisted=greatest(0,coalesce(p_routes_persisted,0)),
      last_error=p_error,
      attempt_count=case
        when p_status='QUEUED' and coalesce(p_error,'') like 'OPENAI_BACKGROUND_PENDING:%'
          then greatest(attempt_count-1,0)
        else attempt_count
      end,
      lease_token=null, lease_expires_at=null, worker_id=null,
      completed_at=case when p_status='COMPLETED' then now() else completed_at end,
      updated_at=now()
  where id=p_job_id and status='CLAIMED' and lease_token=p_lease_token;
  if not found then raise exception 'GENESIS_G82_EXPANSION_LEASE_MISMATCH'; end if;
end $$;

revoke all on function public.settle_genesis_g82_expansion_job(uuid,uuid,text,integer,integer,integer,integer,text) from public, anon, authenticated;
grant execute on function public.settle_genesis_g82_expansion_job(uuid,uuid,text,integer,integer,integer,integer,text) to service_role;

notify pgrst, 'reload schema';

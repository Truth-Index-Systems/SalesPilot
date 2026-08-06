-- Genesis G4.5 critical security hardening.
-- Durable, privacy-preserving request limits for public AI analysis and founder access.

create table if not exists public.request_security_limits (
  scope text not null,
  fingerprint text not null,
  window_started_at timestamptz not null default now(),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (scope, fingerprint)
);

alter table public.request_security_limits enable row level security;
revoke all on table public.request_security_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.request_security_limits to service_role;

create or replace function public.consume_request_security_limit(
  p_scope text,
  p_fingerprint text,
  p_limit integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_row public.request_security_limits%rowtype;
begin
  if coalesce(length(trim(p_scope)), 0) = 0
     or coalesce(length(trim(p_fingerprint)), 0) < 32
     or p_limit < 1
     or p_window_seconds < 60 then
    raise exception 'invalid request limit parameters';
  end if;

  insert into public.request_security_limits(scope, fingerprint, window_started_at, attempt_count, updated_at)
  values (p_scope, p_fingerprint, v_now, 1, v_now)
  on conflict (scope, fingerprint) do update
  set window_started_at = case
        when public.request_security_limits.window_started_at <= v_now - make_interval(secs => p_window_seconds)
          then v_now
        else public.request_security_limits.window_started_at
      end,
      attempt_count = case
        when public.request_security_limits.window_started_at <= v_now - make_interval(secs => p_window_seconds)
          then 1
        else public.request_security_limits.attempt_count + 1
      end,
      updated_at = v_now
  returning * into v_row;

  return v_row.attempt_count <= p_limit;
end;
$$;

create or replace function public.reset_request_security_limit(
  p_scope text,
  p_fingerprint text
) returns void
language sql
security definer
set search_path = public
as $$
  delete from public.request_security_limits
  where scope = p_scope and fingerprint = p_fingerprint;
$$;

revoke all on function public.consume_request_security_limit(text,text,integer,integer) from public, anon, authenticated;
revoke all on function public.reset_request_security_limit(text,text) from public, anon, authenticated;
grant execute on function public.consume_request_security_limit(text,text,integer,integer) to service_role;
grant execute on function public.reset_request_security_limit(text,text) to service_role;

create index if not exists request_security_limits_updated_idx
  on public.request_security_limits(updated_at);

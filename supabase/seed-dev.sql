-- Run once in local/development Supabase, then copy the returned id into
-- SALESPILOT_DEV_ORGANISATION_ID.
insert into public.organisations(name,slug)
values ('Truth Index Systems','truth-index-systems-dev')
on conflict (slug) do update set name=excluded.name
returning id;

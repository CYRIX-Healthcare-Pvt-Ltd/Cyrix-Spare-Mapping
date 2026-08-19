-- This project's default privileges never extended to `service_role`
-- either (same root cause as 0002_grants.sql, discovered when
-- admin-create-user started failing with "permission denied for table
-- profiles" for the service_role client). service_role is meant to bypass
-- RLS entirely for trusted server-side use (our Edge Functions) — it
-- should always have full access, so this grant is intentionally broad,
-- unlike the narrowly-scoped `authenticated` grants in 0002.

grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Also set default privileges so *future* tables/functions don't need a
-- follow-up migration just to be reachable at all.
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;

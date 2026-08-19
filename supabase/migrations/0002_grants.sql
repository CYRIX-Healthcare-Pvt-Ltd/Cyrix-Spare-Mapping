-- Blue Star: explicit table/function grants for the `authenticated` role.
-- This project's default privileges didn't extend to the tables created in
-- 0001_init.sql, so PostgREST was returning "permission denied" even though
-- RLS policies were in place. RLS still does the per-row filtering on top
-- of these — this just gives the role permission to attempt the query.
--
-- edit_requests deliberately has no UPDATE/DELETE grant here: the only
-- sanctioned way to change its status is resolve_edit_request(), which runs
-- SECURITY DEFINER and doesn't need the caller's own table grants.

grant usage on schema public to authenticated;

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.facilities to authenticated;
grant select, insert, delete on public.user_facilities to authenticated;
grant select, insert, update, delete on public.field_definitions to authenticated;
grant select, insert, update, delete on public.equipment to authenticated;
grant select, insert on public.edit_requests to authenticated;
grant select, insert, update on public.app_settings to authenticated;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_pm_or_admin() to authenticated;
grant execute on function public.has_facility_access(uuid) to authenticated;
grant execute on function public.shares_facility_with(uuid) to authenticated;
grant execute on function public.resolve_edit_request(uuid, boolean, text) to authenticated;

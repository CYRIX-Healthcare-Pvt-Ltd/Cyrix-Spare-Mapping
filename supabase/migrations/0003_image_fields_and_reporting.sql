-- Adds an 'image' custom field type (admin-configurable max count per
-- field) and an engineer -> project manager reporting relationship that
-- edit_requests visibility now also routes through.

alter type field_type add value if not exists 'image';

alter table field_definitions add column if not exists image_max_count integer;

alter table profiles add column if not exists reports_to uuid references profiles(id);

create index if not exists profiles_reports_to_idx on profiles(reports_to);

drop policy if exists "edit_requests_select" on edit_requests;
create policy "edit_requests_select" on edit_requests for select
  using (
    requested_by = auth.uid()
    or is_admin()
    or (is_pm_or_admin() and exists (
      select 1 from equipment e where e.id = edit_requests.equipment_id and has_facility_access(e.facility_id)
    ))
    or exists (
      select 1 from profiles p where p.id = edit_requests.requested_by and p.reports_to = auth.uid()
    )
  );

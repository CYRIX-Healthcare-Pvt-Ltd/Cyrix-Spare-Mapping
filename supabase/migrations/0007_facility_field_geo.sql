-- Lets a field engineer add a facility that doesn't exist yet instead of
-- waiting on an admin, and lets a facility's GPS location be captured by
-- whoever tags the first piece of equipment there when it doesn't already
-- have one (covers both facilities added from the field and ones that came
-- in via bulk upload without coordinates). Also records where an engineer
-- actually was when they tagged each item, so it can be compared against
-- the facility's own location later.

drop policy if exists "facilities_admin_insert" on facilities;
create policy "facilities_insert" on facilities for insert
  with check (auth.uid() is not null and created_by = auth.uid());

-- A facility's location can be filled in exactly once by anyone with access
-- to it, but only while it's still unset -- this lets the first tag at a
-- GPS-less facility establish its location, without letting non-admins
-- overwrite an address an admin already set. Full editing of an existing
-- facility (any field, any time) stays admin-only via facilities_admin_update.
create policy "facilities_fill_missing_location" on facilities for update
  using (has_facility_access(id) and latitude is null and longitude is null)
  with check (has_facility_access(id));

alter table equipment add column if not exists tag_latitude double precision;
alter table equipment add column if not exists tag_longitude double precision;

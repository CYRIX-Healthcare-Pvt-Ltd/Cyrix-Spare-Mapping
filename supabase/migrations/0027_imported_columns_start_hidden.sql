-- A master file routinely carries thirty columns. Showing all of them the
-- moment a file is uploaded turns the catalogue into a table nobody can read
-- across, which is the opposite of the point: the file decides what is
-- available, the admin decides what is shown.
--
-- So a discovered column starts hidden and is switched on deliberately. The
-- app's own columns are unaffected -- they are seeded visible in 0026 and
-- are what the table shows until someone chooses otherwise.
alter table public.catalogue_columns alter column visible set default false;

update public.catalogue_columns set visible = false where source = 'imported';

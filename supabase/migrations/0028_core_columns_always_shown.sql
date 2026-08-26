-- The app's own columns are not a preference.
--
-- 0026 treated every column the same -- core and imported alike were things
-- an admin could switch off. But the built-in columns are what the catalogue
-- *is*: the item code and name identify the row, and Cyrix item, Qty, Tagged
-- and Status are the tagging progress this app exists to report. Hiding one
-- of those doesn't tidy the table, it removes the point of it.
--
-- So the choice is now only over the columns a file brought with it, and the
-- rule is enforced here rather than left to the dialog to remember.
update public.catalogue_columns set visible = true where source = 'core';

alter table public.catalogue_columns
  add constraint catalogue_columns_core_always_visible
  check (source <> 'core' or visible);

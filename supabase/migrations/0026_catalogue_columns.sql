-- Whatever columns the master file happens to carry.
--
-- Neither workbook is ours. Blue Star's carries whichever columns the people
-- who maintain it decided on, and that set changes between revisions; the
-- Cyrix export has the same problem. A column per field means every column we
-- didn't anticipate is silently dropped on import -- the admin uploads a
-- fifteen-column sheet and five columns arrive. So the columns we don't have a
-- home for land in a jsonb bag instead, and the site learns the shape of the
-- file from the file.
alter table public.bluestar_item_master
  add column if not exists attributes jsonb not null default '{}'::jsonb;
alter table public.cyrix_item_master
  add column if not exists attributes jsonb not null default '{}'::jsonb;

-- Which columns the site shows, and in what order.
--
-- Site-wide rather than per-user: this is the admin deciding what the
-- catalogue looks like for everyone, not a personal view preference.
--
-- `source` separates the two kinds. 'core' columns are the app's own -- the
-- identity fields, plus the tagging progress the app computes rather than
-- reads -- and exist whether or not any file mentions them. 'imported'
-- columns are discovered from an uploaded sheet and read back out of
-- `attributes`.
create table if not exists public.catalogue_columns (
  catalogue text not null check (catalogue in ('bluestar', 'cyrix')),
  key text not null,
  label text not null,
  source text not null default 'imported' check (source in ('core', 'imported')),
  visible boolean not null default true,
  -- New columns from a fresh upload sort after everything already placed,
  -- so an import never reshuffles a layout the admin has arranged.
  sort_order integer not null default 1000,
  created_at timestamptz not null default now(),
  primary key (catalogue, key)
);

alter table public.catalogue_columns enable row level security;

-- Everyone signed in reads the layout -- an engineer's table has to render
-- the same columns the admin chose. Only admins change it.
create policy "catalogue_columns_select" on public.catalogue_columns
  for select using (auth.uid() is not null);
create policy "catalogue_columns_admin_insert" on public.catalogue_columns
  for insert with check (is_admin());
create policy "catalogue_columns_admin_update" on public.catalogue_columns
  for update using (is_admin()) with check (is_admin());
create policy "catalogue_columns_admin_delete" on public.catalogue_columns
  for delete using (is_admin());

-- Spelled out rather than assumed: default privileges have twice failed to
-- reach a new table in this project (see 0002 and 0004).
grant select, insert, update, delete on public.catalogue_columns to authenticated;
grant all on public.catalogue_columns to service_role;

-- The core columns, seeded so the chooser has something to show before any
-- file is uploaded. `on conflict do nothing` keeps a re-run from resetting
-- visibility the admin has since changed.
insert into public.catalogue_columns (catalogue, key, label, source, visible, sort_order) values
  ('bluestar', 'item_code',  'Item code',  'core', true, 10),
  ('bluestar', 'item_name',  'Item name',  'core', true, 20),
  ('bluestar', 'cyrix_item', 'Cyrix item', 'core', true, 30),
  ('bluestar', 'quantity',   'Qty',        'core', true, 40),
  ('bluestar', 'tagged',     'Tagged',     'core', true, 50),
  ('bluestar', 'status',     'Status',     'core', true, 60),
  ('cyrix', 'item_code',             'Item code',        'core', true, 10),
  ('cyrix', 'item_name',             'Item name',        'core', true, 20),
  ('cyrix', 'in_stock',              'In stock',         'core', true, 30),
  ('cyrix', 'item_cost',             'Item cost',        'core', true, 40),
  ('cyrix', 'additional_identifier', 'Addl. identifier', 'core', true, 50),
  ('cyrix', 'item_group',            'Item group',       'core', true, 60),
  ('cyrix', 'parent_equipment',      'Parent equip',     'core', true, 70),
  ('cyrix', 'make',                  'Make',             'core', true, 80),
  ('cyrix', 'model',                 'Model',            'core', true, 90)
on conflict (catalogue, key) do nothing;

notify pgrst, 'reload schema';

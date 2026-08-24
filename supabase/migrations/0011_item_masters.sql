-- Item masters for the spare-mapping workflow.
--
-- Two separate catalogues exist for the same physical spares:
--   * bpl_item_master  -- BPL's own catalogue. Their barcode is already
--                         printed/stuck on the spare in the warehouse, so
--                         scanning it is how we identify their item.
--   * cyrix_item_master -- Cyrix's own catalogue for the same parts, whose
--                         naming differs (e.g. "abc" vs "ab -c").
--
-- bpl_item_master carries the resolved Cyrix mapping inline: cyrix_item_code
-- is the stable link, cyrix_item_name is kept alongside it so lists and
-- suggestions can render without a join (and so the mapping still reads
-- correctly if the Cyrix catalogue is later re-uploaded with a new name).
-- Both are null until someone confirms the match.

create table cyrix_item_master (
  id uuid primary key default gen_random_uuid(),
  item_code text not null unique,
  item_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index cyrix_item_master_name_idx on cyrix_item_master(lower(item_name));

create table bpl_item_master (
  id uuid primary key default gen_random_uuid(),
  item_code text not null unique,
  item_name text not null,
  barcode text,
  cyrix_item_code text,
  cyrix_item_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Barcode is how a scan finds the row, so it needs to be fast to look up.
-- Deliberately NOT unique: master files in the wild routinely repeat or omit
-- barcodes, and a single bad value shouldn't reject an entire upload.
create index bpl_item_master_barcode_idx on bpl_item_master(barcode);
create index bpl_item_master_name_idx on bpl_item_master(lower(item_name));
create index bpl_item_master_cyrix_code_idx on bpl_item_master(cyrix_item_code);

create trigger trg_cyrix_item_master_touch before update on cyrix_item_master
  for each row execute function public.touch_updated_at();
create trigger trg_bpl_item_master_touch before update on bpl_item_master
  for each row execute function public.touch_updated_at();

alter table cyrix_item_master enable row level security;
alter table bpl_item_master enable row level security;

-- Any signed-in user can read both catalogues -- engineers need to look items
-- up while tagging. Only admins maintain them.
create policy "cyrix_item_master_select" on cyrix_item_master for select using (auth.uid() is not null);
create policy "cyrix_item_master_admin_insert" on cyrix_item_master for insert with check (is_admin());
create policy "cyrix_item_master_admin_update" on cyrix_item_master for update using (is_admin()) with check (is_admin());
create policy "cyrix_item_master_admin_delete" on cyrix_item_master for delete using (is_admin());

create policy "bpl_item_master_select" on bpl_item_master for select using (auth.uid() is not null);
create policy "bpl_item_master_admin_insert" on bpl_item_master for insert with check (is_admin());
create policy "bpl_item_master_admin_delete" on bpl_item_master for delete using (is_admin());

-- Any signed-in user may set the Cyrix mapping on a BPL row (that's the
-- tagger confirming a suggested match); everything else stays admin-only.
create policy "bpl_item_master_admin_update" on bpl_item_master for update
  using (is_admin()) with check (is_admin());
create policy "bpl_item_master_map_update" on bpl_item_master for update
  using (auth.uid() is not null) with check (auth.uid() is not null);

-- Explicit grants: this project's default privileges have twice failed to
-- reach a new table on their own (see 0002 and 0004), so they're spelled out
-- rather than assumed.
grant select, insert, update, delete on public.cyrix_item_master to authenticated;
grant select, insert, update, delete on public.bpl_item_master to authenticated;
grant all on public.cyrix_item_master to service_role;
grant all on public.bpl_item_master to service_role;

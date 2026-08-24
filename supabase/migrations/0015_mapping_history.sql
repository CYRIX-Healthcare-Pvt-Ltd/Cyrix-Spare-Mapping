-- Engineers and managers can re-point a Blue Star item at a different Cyrix
-- item, so every change needs an audit trail: who changed it, when, and what
-- it was before.
--
-- The mapping is therefore only writable through set_cyrix_mapping() below,
-- which records the history row and applies the change in one transaction.
-- The previous blanket "any signed-in user may update this table" policy is
-- dropped: it let a non-admin edit item_name or barcode too, and allowed the
-- mapping to change without leaving a trace.

create table bluestar_item_mapping_history (
  id uuid primary key default gen_random_uuid(),
  bluestar_item_id uuid not null references bluestar_item_master(id) on delete cascade,
  -- Snapshotted so the log still reads correctly if the item's barcode or
  -- name is later corrected in a re-uploaded master file.
  barcode text,
  bluestar_item_code text,
  from_cyrix_item_code text,
  from_cyrix_item_name text,
  to_cyrix_item_code text,
  to_cyrix_item_name text,
  performed_by uuid references profiles(id),
  performed_at timestamptz not null default now()
);

create index bluestar_item_mapping_history_item_idx
  on bluestar_item_mapping_history(bluestar_item_id, performed_at desc);
create index bluestar_item_mapping_history_barcode_idx
  on bluestar_item_mapping_history(barcode);

alter table bluestar_item_mapping_history enable row level security;

create policy "bluestar_item_mapping_history_select" on bluestar_item_mapping_history
  for select using (auth.uid() is not null);

grant select on public.bluestar_item_mapping_history to authenticated;
grant all on public.bluestar_item_mapping_history to service_role;

-- Only admins may edit the catalogue directly now; everyone else changes the
-- mapping through the function.
drop policy if exists "bluestar_item_master_map_update" on bluestar_item_master;

create or replace function public.set_cyrix_mapping(item_id uuid, new_cyrix_code text)
returns bluestar_item_master
language plpgsql
security definer
set search_path = public
as $$
declare
  cur bluestar_item_master;
  cyx cyrix_item_master;
  new_name text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into cur from bluestar_item_master where id = item_id for update;
  if cur is null then
    raise exception 'Blue Star item not found';
  end if;

  if new_cyrix_code is not null then
    select * into cyx from cyrix_item_master where item_code = new_cyrix_code;
    if cyx is null then
      raise exception 'Cyrix item % not found', new_cyrix_code;
    end if;
    new_name := cyx.item_name;
  end if;

  -- Nothing actually changed -- don't write a history row for a no-op.
  if cur.cyrix_item_code is not distinct from new_cyrix_code then
    return cur;
  end if;

  insert into bluestar_item_mapping_history (
    bluestar_item_id, barcode, bluestar_item_code,
    from_cyrix_item_code, from_cyrix_item_name,
    to_cyrix_item_code, to_cyrix_item_name, performed_by
  ) values (
    cur.id, cur.barcode, cur.item_code,
    cur.cyrix_item_code, cur.cyrix_item_name,
    new_cyrix_code, new_name, auth.uid()
  );

  update bluestar_item_master
  set cyrix_item_code = new_cyrix_code,
      cyrix_item_name = new_name
  where id = item_id
  returning * into cur;

  return cur;
end;
$$;

grant execute on function public.set_cyrix_mapping(uuid, text) to authenticated;

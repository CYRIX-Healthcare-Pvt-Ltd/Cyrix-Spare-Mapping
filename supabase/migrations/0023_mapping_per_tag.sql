-- The Blue Star -> Cyrix mapping moves onto the tag.
--
-- It lived on the catalogue row, so all four units of a four-quantity part
-- shared one Cyrix code. A second engineer choosing differently overwrote
-- what the first engineer's units showed, and two units simply could not
-- differ -- the disagreement had nowhere to exist. Now each QR keeps the
-- Cyrix item chosen for it, and the catalogue row reports what its units add
-- up to instead of dictating it.

alter table equipment add column if not exists cyrix_item_code text;
alter table equipment add column if not exists cyrix_item_name text;
create index if not exists equipment_cyrix_code_idx on equipment(cyrix_item_code);

-- Carry across whatever the catalogue currently says, so no tag loses the
-- mapping it was showing a moment ago.
update equipment e
set cyrix_item_code = b.cyrix_item_code,
    cyrix_item_name = b.cyrix_item_name
from bluestar_item_master b
where e.bluestar_item_id = b.id
  and e.cyrix_item_code is null
  and b.cyrix_item_code is not null;

-- History can now say which unit was re-mapped, not just which part.
alter table bluestar_item_mapping_history
  add column if not exists equipment_id uuid references equipment(id) on delete set null;
create index if not exists bluestar_item_mapping_history_equipment_idx
  on bluestar_item_mapping_history(equipment_id);

-- Changing a tag's mapping, audited the same way a catalogue re-map is.
-- Definer because the history table is insert-protected: it must only ever be
-- written by the functions that also apply the change.
create or replace function public.set_tag_cyrix_mapping(p_equipment_id uuid, p_cyrix_code text)
returns equipment
language plpgsql
security definer
set search_path = public
as $$
declare
  eq equipment;
  cyx cyrix_item_master;
  new_name text;
  code text := nullif(btrim(p_cyrix_code), '');
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into eq from equipment where id = p_equipment_id for update;
  if eq is null then
    raise exception 'Spare not found';
  end if;
  if not has_facility_access(eq.facility_id) then
    raise exception 'Not authorized for this warehouse';
  end if;

  if code is not null then
    select * into cyx from cyrix_item_master where item_code = code;
    if cyx is null then
      raise exception 'Cyrix item % not found', code;
    end if;
    new_name := cyx.item_name;
  end if;

  if eq.cyrix_item_code is not distinct from code then
    return eq;
  end if;

  insert into bluestar_item_mapping_history (
    bluestar_item_id, equipment_id, barcode, bluestar_item_code,
    from_cyrix_item_code, from_cyrix_item_name,
    to_cyrix_item_code, to_cyrix_item_name, performed_by
  )
  select eq.bluestar_item_id, eq.id, b.barcode, b.item_code,
         eq.cyrix_item_code, eq.cyrix_item_name,
         code, new_name, auth.uid()
  from bluestar_item_master b where b.id = eq.bluestar_item_id
  union all
  -- An unlinked tag still records its mapping change; there is just no
  -- catalogue row to name alongside it.
  select null, eq.id, null, null,
         eq.cyrix_item_code, eq.cyrix_item_name,
         code, new_name, auth.uid()
  where eq.bluestar_item_id is null;

  update equipment
  set cyrix_item_code = code, cyrix_item_name = new_name
  where id = p_equipment_id
  returning * into eq;

  return eq;
end;
$$;

grant execute on function public.set_tag_cyrix_mapping(uuid, text) to authenticated;

-- What each catalogue item's tags actually add up to: one row per distinct
-- Cyrix item, with how many of that part's units point at it. Definer for the
-- same reason the tag counts are -- equipment is readable only for the
-- warehouses you are assigned to, and this has to mean the same to everyone.
create or replace function public.bluestar_mapping_summary(item_ids uuid[])
returns table (
  bluestar_item_id uuid,
  cyrix_item_code text,
  cyrix_item_name text,
  tag_count bigint
)
language sql
security definer
set search_path = public
as $$
  select e.bluestar_item_id, e.cyrix_item_code, max(e.cyrix_item_name), count(*)::bigint
  from equipment e
  where auth.uid() is not null
    and e.bluestar_item_id = any(item_ids)
    and e.cyrix_item_code is not null
  group by e.bluestar_item_id, e.cyrix_item_code
  order by count(*) desc
$$;

grant execute on function public.bluestar_mapping_summary(uuid[]) to authenticated;

notify pgrst, 'reload schema';

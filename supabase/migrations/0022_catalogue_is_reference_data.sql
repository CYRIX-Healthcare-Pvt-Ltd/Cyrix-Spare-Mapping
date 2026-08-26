-- Corrects a wrong model. Tagging was creating rows in bluestar_item_master,
-- one per QR, using the QR value as the item code. That is backwards.
--
-- Both catalogues are reference data. They change when an admin uploads a new
-- master file and at no other time. A Blue Star item is a *part* -- "Spare X,
-- quantity 4" -- and the four physical units each get their own Cyrix QR
-- sticker. Tagging records a QR against an existing catalogue item; it never
-- invents one. Four tags against one item is the normal case, not four items.
--
-- What tagging may still change is the Blue Star -> Cyrix mapping, which is
-- the whole point of the exercise and stays audited through set_cyrix_mapping.

-- How many units Blue Star's master file says there are. Nullable: a file
-- without the column still imports, and progress simply can't be computed for
-- those rows rather than being computed wrongly.
alter table bluestar_item_master add column if not exists quantity integer;

-- The trigger pushed a spare's edits back into the catalogue. Reference data
-- does not follow the things that reference it.
drop trigger if exists trg_equipment_sync_bluestar on equipment;
drop function if exists public.sync_bluestar_item_from_equipment();

-- The function that created catalogue rows from tags, in both its shapes.
drop function if exists public.upsert_tagged_bluestar_item(text, text, text, text, boolean);
drop function if exists public.upsert_tagged_bluestar_item(text, text, text, text);

-- Remove what that design left behind. Every one of these rows is an
-- artefact: its item_code is a QR value, not a Blue Star code. Deleting them
-- sets equipment.bluestar_item_id to null (0018 declares on delete set null),
-- so the tagged spares survive and simply show as not yet matched to a
-- catalogue item -- which is the truth until the real master file is loaded.
delete from bluestar_item_mapping_history
 where bluestar_item_id in (select id from bluestar_item_master where origin = 'tagged');
delete from bluestar_item_master where origin = 'tagged';

alter table bluestar_item_master drop constraint if exists bluestar_item_master_origin_check;
alter table bluestar_item_master drop column if exists origin;

-- Tagging progress has to be counted across every warehouse, but equipment
-- rows are readable only for the warehouses you are assigned to
-- (equipment_select uses has_facility_access). Counting in the browser would
-- therefore report "1 of 4" to one person and "3 of 4" to another. This
-- returns counts only -- no spare, no warehouse, nothing about who tagged
-- what -- so the number means the same thing to everybody.
create or replace function public.bluestar_tag_counts(item_ids uuid[])
returns table (bluestar_item_id uuid, tagged_count bigint)
language sql
security definer
set search_path = public
as $$
  select e.bluestar_item_id, count(*)::bigint
  from equipment e
  where auth.uid() is not null
    and e.bluestar_item_id = any(item_ids)
  group by e.bluestar_item_id
$$;

grant execute on function public.bluestar_tag_counts(uuid[]) to authenticated;

notify pgrst, 'reload schema';

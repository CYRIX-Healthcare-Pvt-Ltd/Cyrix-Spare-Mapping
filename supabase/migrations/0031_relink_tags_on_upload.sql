-- A catalogue row that comes back should take its tags back with it.
--
-- equipment.bluestar_item_id is ON DELETE SET NULL, so deleting an item from
-- the master leaves the spares tagged against it intact but unlinked -- which
-- is right, since the item they pointed at no longer exists. The problem is
-- what happens next: re-uploading the master file inserts a *new* row with a
-- new id, and nothing was re-pointing those tags at it. They stayed orphaned
-- for good, counting towards nothing, with no way back short of hand-editing
-- the database.
--
-- That was already reachable by deleting one row. With "delete all" on the
-- admin screen it becomes the ordinary way to correct a bad upload: clear the
-- catalogue, upload the fixed file. So linking has to happen on the way in.
--
-- Statement-level with a transition table rather than per row: an upload
-- arrives in chunks of several hundred, and a per-row trigger would re-scan
-- the tags once for every line of the file.
create or replace function public.link_tags_to_inserted_items()
returns trigger
language plpgsql
security definer
set search_path = public as $$
begin
  update equipment e
     set bluestar_item_id = i.id
    from inserted i
   where e.bluestar_item_id is null
     and nullif(btrim(e.custom_fields ->> public.bluestar_code_field_key()), '') = i.item_code;
  return null;
end;
$$;

drop trigger if exists trg_bluestar_item_master_link_tags on public.bluestar_item_master;

create trigger trg_bluestar_item_master_link_tags
after insert on public.bluestar_item_master
referencing new table as inserted
for each statement execute function public.link_tags_to_inserted_items();

-- An upsert only INSERTs codes the catalogue doesn't already have, so a
-- re-upload of an unchanged file fires this for nothing and updates nothing.

notify pgrst, 'reload schema';

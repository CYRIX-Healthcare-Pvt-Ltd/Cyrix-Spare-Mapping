-- Keeps a tagged spare's Blue Star catalogue row in step with the spare
-- itself. Editing a spare has to show up in the Blue Star item list, and
-- there is more than one way to edit one: a manager or admin saving directly,
-- and an engineer's request being approved (which writes through
-- resolve_edit_request, not through the app). A trigger on `equipment` covers
-- every one of those paths at once rather than each caller remembering to.
--
-- Only rows this app created by tagging (origin = 'tagged') are touched.
-- Rows that came from Blue Star's own master file are their record, and a
-- tagger's wording must not overwrite it.

create or replace function public.sync_bluestar_item_from_equipment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  name_key text;
  code_key text;
  nm    text;
  bcode text;
begin
  if new.bluestar_item_id is null then
    return new;
  end if;

  -- The spare's name and Blue Star code live in admin-defined custom fields,
  -- so which keys those are has to be looked up rather than hardcoded.
  select field_key into code_key from field_definitions
   where field_type = 'barcode' and active order by display_order limit 1;

  select field_key into name_key from field_definitions
   where active and field_type not in ('image', 'barcode')
     and (label ilike '%name%' or label ilike '%description%' or label ilike '%spare%')
   order by display_order limit 1;

  nm    := nullif(btrim(coalesce(new.custom_fields ->> name_key, '')), '');
  bcode := nullif(btrim(coalesce(new.custom_fields ->> code_key, '')), '');

  update bluestar_item_master
  set item_name = coalesce(nm, item_name),
      barcode   = coalesce(bcode, barcode)
  where id = new.bluestar_item_id
    and origin = 'tagged'
    and (item_name is distinct from coalesce(nm, item_name)
         or barcode is distinct from coalesce(bcode, barcode));

  return new;
end;
$$;

drop trigger if exists trg_equipment_sync_bluestar on equipment;
create trigger trg_equipment_sync_bluestar
  after insert or update of custom_fields, bluestar_item_id on equipment
  for each row execute function public.sync_bluestar_item_from_equipment();

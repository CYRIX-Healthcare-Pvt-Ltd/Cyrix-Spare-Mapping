-- Unlinking a Cyrix item is now something a tagger can actually ask for
-- (a "Remove" button next to "Change"), so the upsert has to be able to tell
-- "leave the mapping alone" from "clear it".
--
-- Those were the same value before -- a null p_cyrix_code -- and the function
-- deliberately treated it as "leave alone", because on a fresh tag an empty
-- selection means the tagger hasn't chosen yet, not that they want the
-- catalogue row unlinked. An explicit flag keeps that safe default while
-- letting a deliberate removal through.

create or replace function public.upsert_tagged_bluestar_item(
  p_item_code text,
  p_item_name text,
  p_barcode text,
  p_cyrix_code text,
  p_clear_cyrix boolean default false
)
returns bluestar_item_master
language plpgsql
security definer
set search_path = public
as $$
declare
  rec bluestar_item_master;
  code  text := nullif(btrim(p_item_code), '');
  bcode text := nullif(btrim(p_barcode), '');
  nm    text := nullif(btrim(p_item_name), '');
  cyx   text := nullif(btrim(p_cyrix_code), '');
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if code is null then
    raise exception 'A Blue Star item code is required';
  end if;

  -- The barcode Blue Star printed on the spare is the strongest identifier we
  -- have, so an existing catalogue row is matched on that first; the code is
  -- only used when there's no barcode to go on. Barcodes are deliberately not
  -- unique (0011), hence the ordered limit rather than a bare select-into.
  if bcode is not null then
    select * into rec from bluestar_item_master
    where barcode = bcode order by created_at limit 1;
  end if;

  if rec.id is null then
    select * into rec from bluestar_item_master where item_code = code;
  end if;

  if rec.id is null then
    insert into bluestar_item_master (item_code, item_name, barcode, origin)
    values (code, coalesce(nm, code), bcode, 'tagged')
    returning * into rec;
  else
    -- A row that came from Blue Star's master file keeps Blue Star's name --
    -- that file is their record, not ours to overwrite from a tag. Rows this
    -- app created by tagging are ours, so they track what the tagger typed.
    update bluestar_item_master
    set item_name = case when rec.origin = 'tagged' and nm is not null then nm else item_name end,
        barcode   = coalesce(bcode, barcode)
    where id = rec.id
    returning * into rec;
  end if;

  -- Both branches route through set_cyrix_mapping so the change lands in the
  -- mapping history like any other re-map -- an unlink is just as much a
  -- change of mapping as a swap, and reads that way in the log.
  if p_clear_cyrix then
    if rec.cyrix_item_code is not null then
      rec := set_cyrix_mapping(rec.id, null);
    end if;
  elsif cyx is not null and rec.cyrix_item_code is distinct from cyx then
    rec := set_cyrix_mapping(rec.id, cyx);
  end if;

  return rec;
end;
$$;

grant execute on function public.upsert_tagged_bluestar_item(text, text, text, text, boolean) to authenticated;

-- The four-argument version is now unreachable from the app; dropping it
-- keeps PostgREST from having two overloads to disambiguate between.
drop function if exists public.upsert_tagged_bluestar_item(text, text, text, text);

notify pgrst, 'reload schema';

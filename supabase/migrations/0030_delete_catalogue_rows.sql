-- Clearing a catalogue from the admin screen.
--
-- Deleting the rows on screen would be no use here: the item master lists a
-- hundred rows a page out of tens of thousands, so "delete all" has to mean
-- the whole catalogue -- or, when a search is active, everything the search
-- matches, which is what the list is actually showing. The filter therefore
-- lives here rather than in a list of ids the browser had to fetch first.
--
-- Deleting a Blue Star item does not delete the spares tagged against it:
-- equipment.bluestar_item_id is ON DELETE SET NULL, so those tags survive and
-- simply stop counting towards any item's progress until the master file is
-- uploaded again. Their mapping history does cascade away with the item.
--
-- Nothing references cyrix_item_master, because a tag stores the Cyrix code
-- as text -- so clearing that catalogue costs lookups and suggestions, not
-- the mappings already made.
create or replace function public.delete_catalogue_rows(
  p_catalogue text,
  p_search text default null,
  p_ids uuid[] default null
)
returns bigint
language plpgsql
security definer
set search_path = public as $$
declare
  removed bigint;
  pattern text;
begin
  -- Definer rights would otherwise hand this to anyone who could call it.
  -- Both tables already restrict DELETE to is_admin() through RLS; this says
  -- the same thing again because the function bypasses that.
  if not is_admin() then
    raise exception 'Only admins can delete item master rows';
  end if;

  pattern := case when coalesce(btrim(p_search), '') = '' then null else '%' || btrim(p_search) || '%' end;

  if p_catalogue = 'bluestar' then
    delete from bluestar_item_master
    where (p_ids is not null and id = any(p_ids))
       or (p_ids is null and (pattern is null or item_code ilike pattern or item_name ilike pattern));

  elsif p_catalogue = 'cyrix' then
    delete from cyrix_item_master
    where (p_ids is not null and id = any(p_ids))
       or (p_ids is null and (pattern is null
             or item_code ilike pattern
             or item_name ilike pattern
             or additional_identifier ilike pattern
             or make ilike pattern
             or model ilike pattern));

  else
    raise exception 'Unknown catalogue: %', p_catalogue;
  end if;

  get diagnostics removed = row_count;
  return removed;
end;
$$;

grant execute on function public.delete_catalogue_rows(text, text, uuid[]) to authenticated;

notify pgrst, 'reload schema';

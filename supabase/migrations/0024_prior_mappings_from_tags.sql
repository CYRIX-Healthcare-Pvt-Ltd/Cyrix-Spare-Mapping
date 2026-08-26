-- "What has this spare name been linked to before?" now has to be answered
-- from the tags, since that is where the mapping lives. Definer for the usual
-- reason: the answer has to be the same for everyone, and equipment rows are
-- readable only for the warehouses the caller is assigned to.
--
-- Returns counts and the most recent person, nothing about the spares
-- themselves.
create or replace function public.cyrix_mappings_for_name(p_name_normalized text)
returns table (
  cyrix_item_code text,
  cyrix_item_name text,
  tag_count bigint,
  last_mapped_by uuid,
  last_mapped_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select e.cyrix_item_code,
         max(e.cyrix_item_name) as cyrix_item_name,
         count(*)::bigint as tag_count,
         (array_agg(h.performed_by order by h.performed_at desc nulls last))[1] as last_mapped_by,
         max(h.performed_at) as last_mapped_at
  from equipment e
  join bluestar_item_master b on b.id = e.bluestar_item_id
  left join bluestar_item_mapping_history h
    on h.equipment_id = e.id and h.to_cyrix_item_code = e.cyrix_item_code
  where auth.uid() is not null
    and b.name_normalized = p_name_normalized
    and e.cyrix_item_code is not null
  group by e.cyrix_item_code
  order by count(*) desc
$$;

grant execute on function public.cyrix_mappings_for_name(text) to authenticated;

notify pgrst, 'reload schema';

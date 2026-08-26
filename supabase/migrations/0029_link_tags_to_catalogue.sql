-- Every spare an engineer tagged was invisible to the Blue Star item master.
--
-- The link from a tag to its catalogue row lives in equipment.bluestar_item_id,
-- and the app set it in a second statement immediately after inserting the
-- tag. But the only UPDATE policy on equipment is is_pm_or_admin() -- by
-- design, since an engineer's edits are supposed to go through the approval
-- flow -- so for an engineer that second statement matched no rows. RLS
-- filters rather than errors, so nothing failed and nothing was linked.
--
-- The tag still appeared under Tagged, which reads the item code straight out
-- of custom_fields, so the only visible symptom was an item master reporting
-- 0 tagged for a part that plainly had been tagged. Engineers do most of the
-- tagging, so in practice progress was being reported almost entirely blank.
--
-- The app now writes the link as part of the insert, which an engineer is
-- allowed to do. This migration deals with the two places SQL owns: the tags
-- already saved without a link, and the approval path, which applies a new
-- item code without ever re-pointing the link that code decides.

-- Which custom field holds the Blue Star item code. It is admin-configurable,
-- so it is looked up rather than assumed, and there is only ever one.
create or replace function public.bluestar_code_field_key()
returns text
language sql stable security definer set search_path = public as $$
  select field_key from field_definitions
  where field_type = 'barcode' and active
  order by display_order limit 1
$$;

-- The catalogue row a tag's own item code points at, or null when the code is
-- blank or matches nothing. Null is a real answer: it means this spare is not
-- in Blue Star's master file, and it should count towards no item's progress.
create or replace function public.bluestar_item_for_tag(p_equipment_id uuid)
returns uuid
language sql stable security definer set search_path = public as $$
  select b.id
  from equipment e
  join bluestar_item_master b
    on b.item_code = nullif(btrim(e.custom_fields ->> public.bluestar_code_field_key()), '')
  where e.id = p_equipment_id
$$;

-- Backfill. Only fills in links that are missing: a tag deliberately pointed
-- somewhere else is left alone.
update equipment e
set bluestar_item_id = public.bluestar_item_for_tag(e.id)
where e.bluestar_item_id is null
  and public.bluestar_item_for_tag(e.id) is not null;

-- Approving an edit can change the item code, and the item code is what
-- decides the link -- so the link has to be recomputed here too, or an
-- approved correction moves the code without moving the tag with it.
create or replace function public.resolve_edit_request(request_id uuid, approve boolean, note text default null)
returns edit_requests
language plpgsql
security definer
set search_path = public as $$
declare
  req edit_requests;
  eq equipment;
begin
  if not is_pm_or_admin() then
    raise exception 'Only project managers or admins can resolve edit requests';
  end if;

  select * into req from edit_requests where id = request_id for update;
  if req is null then
    raise exception 'Edit request not found';
  end if;
  if req.status <> 'pending' then
    raise exception 'This edit request was already resolved';
  end if;

  select * into eq from equipment where id = req.equipment_id;
  if not has_facility_access(eq.facility_id) then
    raise exception 'Not authorized for this facility';
  end if;

  update edit_requests set
    status = case when approve then 'approved'::request_status else 'rejected'::request_status end,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    review_note = note
  where id = request_id
  returning * into req;

  if approve then
    update equipment set
      name = coalesce(req.proposed_changes->>'name', name),
      location = coalesce(req.proposed_changes->>'location', location),
      facility_id = coalesce((req.proposed_changes->>'facility_id')::uuid, facility_id),
      images = case when req.proposed_changes ? 'images'
        then (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(req.proposed_changes->'images') x)
        else images end,
      custom_fields = case when req.proposed_changes ? 'custom_fields'
        then coalesce(custom_fields, '{}'::jsonb) || (req.proposed_changes->'custom_fields')
        else custom_fields end,
      updated_by = auth.uid(),
      updated_at = now()
    where id = req.equipment_id;

    -- After the change, not before: the new code is what decides the link.
    if req.proposed_changes ? 'custom_fields' then
      update equipment
        set bluestar_item_id = public.bluestar_item_for_tag(req.equipment_id)
        where id = req.equipment_id;
    end if;

    -- performed_by stays the requester (they made the change); approved_by
    -- records the reviewer who let it through.
    insert into equipment_history (equipment_id, action, changes, performed_by, approved_by)
    values (req.equipment_id, 'updated', req.proposed_changes, req.requested_by, auth.uid());
  end if;

  return req;
end;
$$;

grant execute on function public.bluestar_code_field_key() to authenticated;
grant execute on function public.bluestar_item_for_tag(uuid) to authenticated;

notify pgrst, 'reload schema';

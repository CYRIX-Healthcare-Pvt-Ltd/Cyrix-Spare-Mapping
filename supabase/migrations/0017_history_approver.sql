-- An approved edit produced a history row attributed to the engineer who
-- requested it, with no record of who approved it -- so the log couldn't
-- answer "who signed this off". The approver is now recorded alongside the
-- requester, which is the whole point of the approval step.

alter table equipment_history add column if not exists approved_by uuid references profiles(id);

create or replace function public.resolve_edit_request(
  request_id uuid,
  approve boolean,
  note text default null
) returns edit_requests
language plpgsql
security definer
set search_path = public
as $$
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

    -- performed_by stays the requester (they made the change); approved_by
    -- records the reviewer who let it through.
    insert into equipment_history (equipment_id, action, changes, performed_by, approved_by, latitude, longitude)
    values (req.equipment_id, 'updated', req.proposed_changes, req.requested_by, auth.uid(), req.latitude, req.longitude);
  end if;

  return req;
end;
$$;

grant execute on function public.resolve_edit_request(uuid, boolean, text) to authenticated;

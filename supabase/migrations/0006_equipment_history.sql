-- Equipment change history: every "created" (tagged) and "updated" event is
-- logged here, so the detail page can show a full log of who mapped/edited
-- an item and when -- the equipment row itself only ever holds the LATEST
-- updated_by/updated_at, which loses everything before the most recent edit.

create table equipment_history (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references equipment(id) on delete cascade,
  action text not null check (action in ('created', 'updated')),
  changes jsonb not null default '{}',
  performed_by uuid references profiles(id),
  performed_at timestamptz not null default now()
);

create index equipment_history_equipment_idx on equipment_history(equipment_id, performed_at);

alter table equipment_history enable row level security;

-- Readable by anyone who can read the equipment row itself. This subquery
-- against `equipment` still goes through equipment's own RLS policy for the
-- current caller, so it isn't a bypass -- just piggybacking on it.
create policy "equipment_history_select" on equipment_history for select
  using (exists (select 1 from equipment e where e.id = equipment_history.equipment_id));

-- Insertable when recording your own action on equipment you can access
-- (covers the client-side inserts from tagging a new item or editing one
-- directly). The resolve_edit_request() RPC below runs SECURITY DEFINER and
-- doesn't need this policy.
create policy "equipment_history_insert" on equipment_history for insert
  with check (
    performed_by = auth.uid()
    and exists (
      select 1 from equipment e where e.id = equipment_history.equipment_id and has_facility_access(e.facility_id)
    )
  );

-- Explicit grants (this project's default privileges have twice needed a
-- follow-up migration to actually reach a new table -- see 0002 and 0004 --
-- so these are spelled out directly rather than trusted to be inherited).
grant select, insert on public.equipment_history to authenticated;
grant all on public.equipment_history to service_role;

-- Log every approval of an edit request as an 'updated' event, attributed to
-- the engineer who requested the change (the reviewer is already recorded
-- separately on the edit_requests row itself via reviewed_by).
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

    insert into equipment_history (equipment_id, action, changes, performed_by)
    values (req.equipment_id, 'updated', req.proposed_changes, req.requested_by);
  end if;

  return req;
end;
$$;

grant execute on function public.resolve_edit_request(uuid, boolean, text) to authenticated;

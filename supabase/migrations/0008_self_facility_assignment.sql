-- When an engineer adds a facility from the field (see 0007), they need to
-- keep access to it themselves afterwards -- otherwise it vanishes from
-- their own facility picker the moment they reload. Admin still has to
-- explicitly assign it to any other engineer, same as any other facility.

create policy "user_facilities_self_insert" on user_facilities for insert
  with check (user_id = auth.uid());

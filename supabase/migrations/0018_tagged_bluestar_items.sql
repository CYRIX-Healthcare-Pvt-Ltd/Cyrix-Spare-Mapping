-- Tagging a spare *is* recording one of Blue Star's items in a warehouse, but
-- until now a tag only ever wrote to `equipment`. The Blue Star catalogue
-- stayed empty however many spares had been tagged against it, and a Cyrix
-- link made while tagging had nowhere to live -- the mapping columns sit on
-- bluestar_item_master, and no row existed to carry them.
--
-- So every tagged spare now creates (or joins) a Blue Star item, and the
-- equipment row points at it. That keeps the Cyrix mapping in exactly one
-- place no matter where it was set -- the tag form or the admin catalogue --
-- and routes both through the same history-writing path.

alter table bluestar_item_master
  add column if not exists origin text not null default 'upload';

-- Separates rows that came from Blue Star's own master file from rows this
-- app created while tagging: the two are maintained differently (see the
-- name rule in upsert_tagged_bluestar_item below).
alter table bluestar_item_master
  drop constraint if exists bluestar_item_master_origin_check;
alter table bluestar_item_master
  add constraint bluestar_item_master_origin_check check (origin in ('upload', 'tagged'));

alter table equipment
  add column if not exists bluestar_item_id uuid references bluestar_item_master(id) on delete set null;

create index if not exists equipment_bluestar_item_idx on equipment(bluestar_item_id);

-- Engineers may not insert into the catalogue directly (that stays admin-only,
-- migration 0011), so tagging goes through this definer function instead. It
-- is deliberately the *only* way a tag reaches the catalogue.
create or replace function public.upsert_tagged_bluestar_item(
  p_item_code text,
  p_item_name text,
  p_barcode text,
  p_cyrix_code text
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

  -- Routed through set_cyrix_mapping so the change lands in the mapping
  -- history like any other re-map. Clearing is not done here: an empty
  -- selection on the tag form means "not decided yet", not "unlink".
  if cyx is not null and rec.cyrix_item_code is distinct from cyx then
    rec := set_cyrix_mapping(rec.id, cyx);
  end if;

  return rec;
end;
$$;

grant execute on function public.upsert_tagged_bluestar_item(text, text, text, text) to authenticated;

-- Backfill: spares tagged before this migration never reached the catalogue,
-- which is exactly the gap this fixes. The name and Blue Star code live in
-- admin-defined custom fields, so their keys are read from field_definitions
-- rather than hardcoded.
do $$
declare
  name_key text;
  code_key text;
  eq record;
  code  text;
  nm    text;
  bcode text;
  found_id uuid;
begin
  select field_key into code_key from field_definitions
   where field_type = 'barcode' and active order by display_order limit 1;

  select field_key into name_key from field_definitions
   where active and field_type not in ('image', 'barcode')
     and (label ilike '%name%' or label ilike '%description%' or label ilike '%spare%')
   order by display_order limit 1;

  for eq in select * from equipment where bluestar_item_id is null loop
    found_id := null;
    bcode := nullif(btrim(coalesce(eq.custom_fields ->> code_key, '')), '');
    nm    := nullif(btrim(coalesce(eq.custom_fields ->> name_key, '')), '');
    code  := coalesce(bcode, eq.qr_value);

    if bcode is not null then
      select id into found_id from bluestar_item_master where barcode = bcode order by created_at limit 1;
    end if;
    if found_id is null then
      select id into found_id from bluestar_item_master where item_code = code;
    end if;
    if found_id is null then
      insert into bluestar_item_master (item_code, item_name, barcode, origin)
      values (code, coalesce(nm, code), bcode, 'tagged')
      returning id into found_id;
    end if;

    update equipment set bluestar_item_id = found_id where id = eq.id;
  end loop;
end $$;

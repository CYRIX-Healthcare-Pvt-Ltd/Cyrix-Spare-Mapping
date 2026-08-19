-- Blue Star: initial schema, RLS policies, and the edit-request approval RPC.
-- Apply with: supabase db push  (after `supabase link`), or paste into the
-- Supabase Dashboard SQL editor.

create extension if not exists pgcrypto;

create type user_role as enum ('engineer', 'project_manager', 'admin');
create type field_type as enum ('text', 'number', 'date', 'dropdown', 'textarea', 'boolean');
create type request_status as enum ('pending', 'approved', 'rejected');

-- ============================================================================
-- Tables
-- ============================================================================

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  ecode text not null unique,
  full_name text not null,
  role user_role not null default 'engineer',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table facilities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  city text,
  active boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table user_facilities (
  user_id uuid not null references profiles(id) on delete cascade,
  facility_id uuid not null references facilities(id) on delete cascade,
  primary key (user_id, facility_id)
);

create table field_definitions (
  id uuid primary key default gen_random_uuid(),
  field_key text not null unique,
  label text not null,
  field_type field_type not null default 'text',
  options jsonb not null default '[]',
  required boolean not null default false,
  display_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table equipment (
  id uuid primary key default gen_random_uuid(),
  qr_value text not null unique,
  facility_id uuid not null references facilities(id),
  name text not null,
  location text not null,
  images text[] not null default '{}',
  custom_fields jsonb not null default '{}',
  created_by uuid references profiles(id),
  updated_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint equipment_images_max3
    check (array_length(images, 1) is null or array_length(images, 1) <= 3)
);

create index equipment_facility_idx on equipment(facility_id);
create index equipment_qr_idx on equipment(qr_value);

create table edit_requests (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references equipment(id) on delete cascade,
  requested_by uuid not null references profiles(id),
  proposed_changes jsonb not null,
  status request_status not null default 'pending',
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);

create index edit_requests_equipment_idx on edit_requests(equipment_id);
create index edit_requests_status_idx on edit_requests(status);

create table app_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- updated_at triggers
-- ============================================================================

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_touch before update on profiles
  for each row execute function public.touch_updated_at();
create trigger trg_facilities_touch before update on facilities
  for each row execute function public.touch_updated_at();
create trigger trg_field_definitions_touch before update on field_definitions
  for each row execute function public.touch_updated_at();
create trigger trg_equipment_touch before update on equipment
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- RLS helper functions (SECURITY DEFINER so they can read profiles/
-- user_facilities without recursive-policy issues)
-- ============================================================================

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from profiles where id = auth.uid()), false);
$$;

create or replace function public.is_pm_or_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('project_manager', 'admin') from profiles where id = auth.uid()), false);
$$;

create or replace function public.has_facility_access(target_facility uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select
    coalesce((select role = 'admin' from profiles where id = auth.uid()), false)
    or exists (
      select 1 from user_facilities uf
      where uf.user_id = auth.uid() and uf.facility_id = target_facility
    );
$$;

create or replace function public.shares_facility_with(target_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from user_facilities a
    join user_facilities b on a.facility_id = b.facility_id
    where a.user_id = auth.uid() and b.user_id = target_user
  );
$$;

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table profiles enable row level security;
alter table facilities enable row level security;
alter table user_facilities enable row level security;
alter table field_definitions enable row level security;
alter table equipment enable row level security;
alter table edit_requests enable row level security;
alter table app_settings enable row level security;

-- profiles: see your own row; admins see everyone; PMs see profiles that
-- share a facility with them (so they can label "requested by" in approvals).
create policy "profiles_select" on profiles for select
  using (id = auth.uid() or is_admin() or (is_pm_or_admin() and shares_facility_with(id)));
create policy "profiles_admin_insert" on profiles for insert with check (is_admin());
create policy "profiles_admin_update" on profiles for update using (is_admin()) with check (is_admin());
create policy "profiles_admin_delete" on profiles for delete using (is_admin());

-- facilities: any signed-in user can read the list; only admins manage it.
create policy "facilities_select" on facilities for select using (auth.uid() is not null);
create policy "facilities_admin_insert" on facilities for insert with check (is_admin());
create policy "facilities_admin_update" on facilities for update using (is_admin()) with check (is_admin());
create policy "facilities_admin_delete" on facilities for delete using (is_admin());

-- user_facilities: users can see their own assignments; admins manage all.
create policy "user_facilities_select" on user_facilities for select
  using (user_id = auth.uid() or is_admin());
create policy "user_facilities_admin_insert" on user_facilities for insert with check (is_admin());
create policy "user_facilities_admin_delete" on user_facilities for delete using (is_admin());

-- field_definitions: any signed-in user can read; only admins manage them.
create policy "field_definitions_select" on field_definitions for select using (auth.uid() is not null);
create policy "field_definitions_admin_insert" on field_definitions for insert with check (is_admin());
create policy "field_definitions_admin_update" on field_definitions for update using (is_admin()) with check (is_admin());
create policy "field_definitions_admin_delete" on field_definitions for delete using (is_admin());

-- equipment: readable/insertable ("claim a QR") by anyone with facility
-- access; only PM/admin can update directly; only admin can delete.
create policy "equipment_select" on equipment for select
  using (has_facility_access(facility_id));
create policy "equipment_insert" on equipment for insert
  with check (has_facility_access(facility_id) and created_by = auth.uid());
create policy "equipment_pm_admin_update" on equipment for update
  using (is_pm_or_admin() and has_facility_access(facility_id))
  with check (is_pm_or_admin() and has_facility_access(facility_id));
create policy "equipment_admin_delete" on equipment for delete using (is_admin());

-- edit_requests: engineers/PMs can file requests on equipment they can see
-- and read their own; PM/admin can read all requests for their facilities.
-- Status changes only happen through resolve_edit_request() below — there
-- is deliberately no client-facing UPDATE policy.
create policy "edit_requests_select" on edit_requests for select
  using (
    requested_by = auth.uid()
    or is_admin()
    or (is_pm_or_admin() and exists (
      select 1 from equipment e where e.id = edit_requests.equipment_id and has_facility_access(e.facility_id)
    ))
  );
create policy "edit_requests_insert" on edit_requests for insert
  with check (
    requested_by = auth.uid()
    and exists (
      select 1 from equipment e where e.id = edit_requests.equipment_id and has_facility_access(e.facility_id)
    )
  );

-- app_settings: any signed-in user can read; only admins write.
create policy "app_settings_select" on app_settings for select using (auth.uid() is not null);
create policy "app_settings_admin_insert" on app_settings for insert with check (is_admin());
create policy "app_settings_admin_update" on app_settings for update using (is_admin()) with check (is_admin());

-- ============================================================================
-- resolve_edit_request: the only way an edit_requests row's status changes.
-- Runs as SECURITY DEFINER so it can atomically flip the request and merge
-- the approved changes into the equipment row in one transaction.
-- ============================================================================

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
  end if;

  return req;
end;
$$;

grant execute on function public.resolve_edit_request(uuid, boolean, text) to authenticated;

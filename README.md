# Blue Star — Hospital Equipment QR Tracker

Scan a QR sticker on a piece of hospital equipment to see its location, name and
photos — or, if the code hasn't been used yet, tag it on the spot. Built as an
installable PWA (works offline for the app shell; equipment data always loads
live) for field engineers, project managers and admins.

- **Engineer** — scans QR codes, tags new equipment, can request edits to existing records.
- **Project Manager** — everything an engineer can do, plus editing equipment directly and approving/rejecting edit requests.
- **Admin** — full control: facilities, custom fields, users, settings.

## Stack

React + TypeScript + Vite, Tailwind CSS, Supabase (Postgres, Auth, Row-Level
Security, Edge Functions), deployed on Vercel.

## 1. Local setup

```bash
npm install
cp .env.example .env.local   # fill in your Supabase project URL + anon key (step 3)
npm run dev
```

## 2. Push to GitHub

```bash
git init
git add .
git commit -m "Initial scaffold"
git branch -M main
git remote add origin https://github.com/Kevi47/Blue-Star.git
git push -u origin main
```

## 3. Create and link a Supabase project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and create a new project.
2. In **Project Settings → API**, copy the **Project URL** and **anon public key** into `.env.local`:
   ```
   VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
3. Install the Supabase CLI (or use `npx supabase ...` for every command below without installing globally):
   ```bash
   npm install -g supabase
   supabase login
   supabase link --project-ref xxxxxxxx   # the ref is in your project URL
   ```
4. Apply the database schema (tables, RLS policies, the edit-approval function):
   ```bash
   supabase db push
   ```
   (Or paste the contents of `supabase/migrations/0001_init.sql` into the Dashboard's SQL Editor and run it.)
5. Deploy the Edge Functions used by the admin "Add user" / "Delete user" / "Reset password" flows:
   ```bash
   supabase functions deploy admin-create-user
   supabase functions deploy admin-delete-user
   supabase functions deploy admin-reset-password
   ```
   These functions need the project's **service role key** (Project Settings → API → `service_role` secret) available as a secret — but Supabase sets `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` for every Edge Function automatically, so no manual `supabase secrets set` is needed here.

### Bootstrap the first admin

Nobody can use the "Add user" screen until at least one admin exists — and creating an
admin requires an existing admin. So the very first one is created by hand, once:

1. Supabase Dashboard → **Authentication → Users → Add user**. Set the email to
   `<ecode>@blue-star.internal` (e.g. `admin1@blue-star.internal`) and set a password.
2. Supabase Dashboard → **SQL Editor**, run (swap in the user id shown after step 1):
   ```sql
   insert into public.profiles (id, ecode, full_name, role)
   values ('<the-user-id-from-step-1>', 'admin1', 'Your Name', 'admin');
   ```
3. Log into the app with employee code `admin1` and the password you set. From there,
   use **Admin → Users** to create everyone else normally.

Everyone created via **Admin → Users** gets their employee code as their default
password (min 6 characters) — no separate temp password to hand out. They can change
it themselves from **Account** after logging in, or an admin can set a specific new
one via the key icon next to their name.

## 4. Deploy to Vercel

1. [vercel.com/new](https://vercel.com/new) → import the `Kevi47/Blue-Star` GitHub repo.
2. Framework preset: Vite (auto-detected). Build command `npm run build`, output `dist` (defaults).
3. Add the two environment variables from `.env.local` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
4. Deploy. `vercel.json` already handles the SPA rewrite so client-side routes don't 404 on refresh.

## Mobile / PWA QA checklist

The dev sandbox this was built in can't access a real camera or "Add to Home
Screen", so check these manually on a phone once deployed:

- [ ] Visit the Vercel URL on Android Chrome / iOS Safari — should prompt (or offer via the browser menu) to "Add to Home Screen" / "Install app".
- [ ] Installed app opens full-screen (no browser chrome), with the Blue Star icon.
- [ ] `/scan` asks for camera permission and the live viewfinder + scan-line animation shows.
- [ ] Scanning an unmapped QR (or one of the demo codes below) routes to the "Tag new equipment" form; scanning a mapped one shows its details.
- [ ] "Upload a QR photo instead" works as a fallback if camera access is denied.

## Project layout

```
src/
  pages/            route-level screens (incl. pages/admin/*)
  components/       QRScanner, EquipmentForm, ImageUploader, DynamicFieldRenderer, Layout, ...
  context/          AuthContext (session + profile + role)
  lib/               supabaseClient, imageCompress
  types/             database.ts (hand-written to match the SQL schema), app.ts (convenience aliases)
supabase/
  migrations/0001_init.sql   tables, RLS policies, resolve_edit_request()
  functions/                 admin-create-user, admin-delete-user (service-role only)
```

// Creates a login (auth user + profiles row) for an engineer/PM/admin.
// Must run with the service-role key, so it lives here as an Edge Function
// instead of in client code. Only an existing admin may call it.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const VALID_ROLES = ['engineer', 'project_manager', 'admin']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return json({ error: 'Missing Authorization header' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const {
    data: { user: caller },
    error: callerError,
  } = await callerClient.auth.getUser()
  if (callerError || !caller) {
    return json({ error: 'Not authenticated' }, 401)
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  const { data: callerProfile } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', caller.id)
    .single()

  if (callerProfile?.role !== 'admin') {
    return json({ error: 'Only admins can create users' }, 403)
  }

  const body = await req.json().catch(() => ({}))
  const { ecode, full_name, role, facility_ids } = body ?? {}

  if (!ecode || !full_name || !role) {
    return json({ error: 'ecode, full_name and role are required' }, 400)
  }
  if (!VALID_ROLES.includes(role)) {
    return json({ error: 'Invalid role' }, 400)
  }

  const cleanEcode = String(ecode).trim()
  // The default password is the employee code itself, so onboarding needs no
  // separate temp password — the user changes it after first login (Account
  // page). Supabase's own minimum is 6 characters, so the ecode must be too.
  if (cleanEcode.length < 6) {
    return json({ error: 'Employee code must be at least 6 characters — it doubles as the default password.' }, 400)
  }
  const password = cleanEcode
  const email = `${cleanEcode.toLowerCase()}@blue-star.internal`

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (createError || !created.user) {
    return json({ error: createError?.message ?? 'Could not create user' }, 400)
  }

  const { error: profileError } = await adminClient.from('profiles').insert({
    id: created.user.id,
    ecode: cleanEcode,
    full_name,
    role,
  })
  if (profileError) {
    await adminClient.auth.admin.deleteUser(created.user.id)
    return json({ error: profileError.message }, 400)
  }

  if (Array.isArray(facility_ids) && facility_ids.length > 0) {
    const { error: facilityError } = await adminClient
      .from('user_facilities')
      .insert(facility_ids.map((facility_id: string) => ({ user_id: created.user.id, facility_id })))
    if (facilityError) {
      return json({ error: `User created, but facility assignment failed: ${facilityError.message}` }, 207)
    }
  }

  return json({ id: created.user.id }, 200)
})

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

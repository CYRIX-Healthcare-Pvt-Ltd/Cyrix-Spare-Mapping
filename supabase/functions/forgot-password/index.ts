// Self-service password reset by employee code, with NO identity
// verification beyond knowing the ecode — there's no real inbox behind the
// synthetic email to prove ownership another way. This is intentionally a
// low-security convenience for an internal tool (confirmed with the team),
// not a hardened flow: anyone who knows or guesses a valid ecode can reset
// that account's password. Called before login, so must NOT require a JWT.
//
// Safeguard: admin accounts are excluded from this path. Worst case is a
// compromised engineer/PM login, never a full admin takeover — admins are
// reset by another admin via Admin -> Users instead.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  const body = await req.json().catch(() => ({}))
  const { ecode, new_password } = body ?? {}

  if (!ecode || !new_password) {
    return json({ error: 'ecode and new_password are required' }, 400)
  }
  if (String(new_password).length < 6) {
    return json({ error: 'Password must be at least 6 characters' }, 400)
  }

  const cleanEcode = String(ecode).trim()

  const { data: profile } = await adminClient
    .from('profiles')
    .select('id, role')
    .ilike('ecode', cleanEcode)
    .maybeSingle()

  if (!profile) {
    return json({ error: 'No account found with that employee code' }, 404)
  }
  if (profile.role === 'admin') {
    return json({ error: 'Admin accounts can only be reset by another admin, from Admin → Users.' }, 403)
  }

  const { error } = await adminClient.auth.admin.updateUserById(profile.id, { password: new_password })
  if (error) {
    return json({ error: error.message }, 400)
  }

  return json({ ok: true }, 200)
})

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

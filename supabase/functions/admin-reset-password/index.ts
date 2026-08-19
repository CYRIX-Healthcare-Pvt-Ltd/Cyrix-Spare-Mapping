// Sets a new password for an existing user. There's no real inbox behind an
// employee code's synthetic email, so "forgot password" is admin-mediated
// instead of an emailed reset link. Only an existing admin may call this.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

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
    return json({ error: 'Only admins can reset passwords' }, 403)
  }

  const body = await req.json().catch(() => ({}))
  const { user_id, password } = body ?? {}

  if (!user_id || !password) {
    return json({ error: 'user_id and password are required' }, 400)
  }
  if (String(password).length < 8) {
    return json({ error: 'Password must be at least 8 characters' }, 400)
  }

  const { error } = await adminClient.auth.admin.updateUserById(user_id, { password })
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

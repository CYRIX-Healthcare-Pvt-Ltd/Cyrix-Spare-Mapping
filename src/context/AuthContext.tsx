import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, ecodeToEmail } from '../lib/supabaseClient'
import type { AppRole } from '../types/database'

export interface Profile {
  id: string
  ecode: string
  full_name: string
  role: AppRole
  active: boolean
  facilityIds: string[]
  /**
   * The profile photo, as a data URL.
   *
   * Read from `employees`, not `profiles`: HR uploads it in KPI and that
   * row is the master for every module. Copying it here would be a second
   * picture of the same person that goes stale the day somebody changes
   * theirs — and it is 5 KB of base64 a thousand times over.
   */
  avatar: string | null
}

interface AuthContextValue {
  session: Session | null
  profile: Profile | null
  loading: boolean
  signIn: (ecode: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

async function loadProfile(userId: string): Promise<Profile | null> {
  const [{ data: profileRow }, { data: facilityRows }, employee] = await Promise.all([
    supabase.from('profiles').select('id, ecode, full_name, role, active').eq('id', userId).single(),
    supabase.from('user_facilities').select('facility_id').eq('user_id', userId),
    // maybeSingle, not single: an account can exist here without an
    // employee record behind it, and a missing photo is a missing photo,
    // not a failed sign-in.
    supabase.from('employees').select('avatar').eq('auth_user_id', userId).maybeSingle(),
  ])

  if (!profileRow) return null

  /*
   * `employees` is KPI's table. It lives in the same Supabase project, so
   * the query works, but `database.ts` describes *this* app's migrations
   * and does not mention it — which makes the row `never` and this the one
   * place a cast is the honest answer.
   *
   * Declared here rather than added to database.ts on purpose: that file
   * is a record of what Spare owns, and a photo read across the boundary
   * is not a table Spare owns.
   */
  const employeeRow = employee.data as { avatar: string | null } | null

  return {
    ...profileRow,
    facilityIds: (facilityRows ?? []).map((r) => r.facility_id),
    avatar: employeeRow?.avatar ?? null,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshProfile = useCallback(async () => {
    const {
      data: { session: current },
    } = await supabase.auth.getSession()
    if (!current) {
      setProfile(null)
      return
    }
    setProfile(await loadProfile(current.user.id))
  }, [])

  // Tracks whose profile is currently loaded, so we can tell a real sign-in
  // (identity changes) apart from a silent background token refresh (same
  // identity) — only the former should re-show a loading state.
  const lastUserIdRef = useRef<string | null>(null)

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(async ({ data: { session: current } }) => {
      if (!active) return
      lastUserIdRef.current = current?.user.id ?? null
      setSession(current)
      setProfile(current ? await loadProfile(current.user.id) : null)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, current) => {
      const isNewIdentity = (current?.user.id ?? null) !== lastUserIdRef.current
      lastUserIdRef.current = current?.user.id ?? null

      // Session and profile must land together — if a route decision (e.g.
      // ProtectedRoute) is made while session is set but profile hasn't
      // caught up yet, it bounces back to /login and can get stuck blank.
      if (isNewIdentity) setLoading(true)
      setSession(current)
      setProfile(current ? await loadProfile(current.user.id) : null)
      if (isNewIdentity) setLoading(false)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (ecode: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: ecodeToEmail(ecode),
      password,
    })
    return { error: error ? 'Incorrect employee code or password.' : null }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  return (
    <AuthContext.Provider value={{ session, profile, loading, signIn, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}

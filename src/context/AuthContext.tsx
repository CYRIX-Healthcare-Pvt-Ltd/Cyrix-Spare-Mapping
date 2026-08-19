import { createContext, useContext, useEffect, useState, useCallback } from 'react'
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
  const [{ data: profileRow }, { data: facilityRows }] = await Promise.all([
    supabase.from('profiles').select('id, ecode, full_name, role, active').eq('id', userId).single(),
    supabase.from('user_facilities').select('facility_id').eq('user_id', userId),
  ])

  if (!profileRow) return null

  return {
    ...profileRow,
    facilityIds: (facilityRows ?? []).map((r) => r.facility_id),
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

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(async ({ data: { session: current } }) => {
      if (!active) return
      setSession(current)
      setProfile(current ? await loadProfile(current.user.id) : null)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, current) => {
      setSession(current)
      setProfile(current ? await loadProfile(current.user.id) : null)
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

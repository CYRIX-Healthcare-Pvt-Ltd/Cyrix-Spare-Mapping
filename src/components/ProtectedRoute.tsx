import { useEffect, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { AppRole } from '../types/database'
import { SpinnerIcon } from './icons'

/**
 * Back to the portal, which owns signing in for every module.
 *
 * Not <Navigate to="/">: this app is mounted under a /spare basename, so
 * the router resolves "/" to /spare/ and sends you round again. Leaving
 * the app means leaving the router.
 */
function ToPortal() {
  useEffect(() => {
    window.location.assign('/')
  }, [])
  return (
    <div className="flex h-screen items-center justify-center">
      <SpinnerIcon className="h-8 w-8 text-brand-600" />
    </div>
  )
}

export function ProtectedRoute({ children, roles }: { children: ReactNode; roles?: AppRole[] }) {
  const { session, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <SpinnerIcon className="h-8 w-8 text-brand-600" />
      </div>
    )
  }

  // Nobody is signed in. The portal is where that happens now.
  if (!session) {
    return <ToPortal />
  }

  /*
    Signed in, but this database has no Spare profile for them.

    Deliberately not a redirect. The portal would see a perfectly valid
    session, show the tiles, and send them back here on the next click —
    a loop with no error anywhere in it, which is exactly how this
    presented before Spare moved into the shared database.

    Since profiles is fed from HR's employee list, the only ways to get
    here are an account with no employee record behind it, or a person
    added to KPI while this page was open.
  */
  if (!profile) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-slate-900">Spare Mapping does not have a record for this account.</p>
        <p className="text-sm text-slate-600">
          Ask HR to check the employee record, then sign in again.
        </p>
        <a className="text-sm font-medium text-brand-700 underline" href="/">
          Back to Cyrix
        </a>
      </div>
    )
  }

  if (!profile.active) {
    return (
      <div className="flex h-screen items-center justify-center px-6 text-center">
        <p className="text-slate-600">
          Your account is deactivated. Contact an admin at your warehouse for help.
        </p>
      </div>
    )
  }

  if (roles && !roles.includes(profile.role)) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

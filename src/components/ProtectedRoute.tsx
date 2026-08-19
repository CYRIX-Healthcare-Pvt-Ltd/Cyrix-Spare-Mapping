import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { AppRole } from '../types/database'
import { SpinnerIcon } from './icons'

export function ProtectedRoute({ children, roles }: { children: ReactNode; roles?: AppRole[] }) {
  const { session, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <SpinnerIcon className="h-8 w-8 text-brand-600" />
      </div>
    )
  }

  if (!session || !profile) {
    return <Navigate to="/login" replace />
  }

  if (!profile.active) {
    return (
      <div className="flex h-screen items-center justify-center px-6 text-center">
        <p className="text-slate-600">
          Your account is deactivated. Contact an admin at your facility for help.
        </p>
      </div>
    )
  }

  if (roles && !roles.includes(profile.role)) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

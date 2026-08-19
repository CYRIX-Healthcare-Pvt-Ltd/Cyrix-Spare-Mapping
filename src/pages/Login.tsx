import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { SpinnerIcon } from '../components/icons'
import { CyrixLogo } from '../components/CyrixLogo'
import { BlueStarLogo } from '../components/BlueStarLogo'

export default function Login() {
  const { session, loading, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [ecode, setEcode] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [showForgot, setShowForgot] = useState(false)

  if (!loading && session) {
    const to = (location.state as { from?: string } | null)?.from ?? '/'
    return <Navigate to={to} replace />
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await signIn(ecode, password)
    setSubmitting(false)
    if (error) {
      setError(error)
      return
    }
    navigate('/', { replace: true })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-6 flex flex-col items-center gap-3">
          <CyrixLogo className="text-lg" />
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-slate-400">for</p>
          <BlueStarLogo className="text-sm" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="ecode" className="mb-1 block text-sm font-medium text-slate-700">
              Employee code
            </label>
            <input
              id="ecode"
              type="text"
              autoComplete="username"
              required
              value={ecode}
              onChange={(e) => setEcode(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder="e.g. ENG-104"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div className="text-right">
            <button
              type="button"
              onClick={() => setShowForgot((v) => !v)}
              className="text-xs font-medium text-brand-700 hover:underline"
            >
              Forgot password?
            </button>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60"
          >
            {submitting && <SpinnerIcon className="h-4 w-4" />}
            Sign in
          </button>
        </form>

        {showForgot && (
          <ForgotPasswordPanel
            onDone={(resolvedEcode) => {
              setEcode(resolvedEcode)
              setShowForgot(false)
            }}
          />
        )}

        <p className="mt-6 text-center text-xs text-slate-400">
          Don't have an employee code? Ask your facility admin to add you.
        </p>
      </div>
    </div>
  )
}

function ForgotPasswordPanel({ onDone }: { onDone: (ecode: string) => void }) {
  const [ecode, setEcode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.")
      return
    }

    setSubmitting(true)
    const { data, error: fnError } = await supabase.functions.invoke('forgot-password', {
      body: { ecode, new_password: newPassword },
    })
    setSubmitting(false)

    if (fnError || data?.error) {
      setError(data?.error ?? fnError?.message ?? 'Could not reset that password.')
      return
    }
    setSuccess(true)
    window.setTimeout(() => onDone(ecode), 900)
  }

  return (
    <div className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
      {success ? (
        <p className="text-center text-sm text-emerald-600">Password updated — signing you in with it now.</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            required
            type="text"
            placeholder="Employee code"
            value={ecode}
            onChange={(e) => setEcode(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <input
            required
            type="password"
            placeholder="New password (min 6 characters)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <input
            required
            type="password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60"
          >
            {submitting && <SpinnerIcon className="h-4 w-4" />}
            Reset password
          </button>
          <p className="text-center text-[11px] text-slate-400">
            Admin accounts can't be reset here — an existing admin resets those from Admin → Users.
          </p>
        </form>
      )}
    </div>
  )
}

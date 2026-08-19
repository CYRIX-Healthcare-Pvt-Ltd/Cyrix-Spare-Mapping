import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import { PlusIcon, TrashIcon, SpinnerIcon, KeyIcon } from '../../components/icons'
import type { ProfileRow, FacilityRow } from '../../types/app'
import type { AppRole } from '../../types/database'

const ROLE_LABEL: Record<AppRole, string> = {
  engineer: 'Engineer',
  project_manager: 'Project Manager',
  admin: 'Admin',
}

interface UserRow extends ProfileRow {
  facilityIds: string[]
}

export default function Users() {
  const { profile: currentProfile } = useAuth()
  const [users, setUsers] = useState<UserRow[]>([])
  const [facilities, setFacilities] = useState<FacilityRow[]>([])
  const [loading, setLoading] = useState(true)

  const [ecode, setEcode] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<AppRole>('engineer')
  const [selectedFacilities, setSelectedFacilities] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [editingFacilitiesFor, setEditingFacilitiesFor] = useState<string | null>(null)
  const [editSelection, setEditSelection] = useState<string[]>([])
  const [resettingFor, setResettingFor] = useState<string | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetConfirm, setResetConfirm] = useState('')
  const [resetError, setResetError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [{ data: profileRows }, { data: facilityRows }, { data: assignments }] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at'),
      supabase.from('facilities').select('*').eq('active', true).order('name'),
      supabase.from('user_facilities').select('user_id, facility_id'),
    ])

    const byUser = new Map<string, string[]>()
    for (const a of assignments ?? []) {
      byUser.set(a.user_id, [...(byUser.get(a.user_id) ?? []), a.facility_id])
    }

    setUsers((profileRows ?? []).map((p) => ({ ...p, facilityIds: byUser.get(p.id) ?? [] })))
    setFacilities(facilityRows ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const { data, error: fnError } = await supabase.functions.invoke('admin-create-user', {
      body: { ecode, full_name: fullName, role, facility_ids: selectedFacilities },
    })

    setSubmitting(false)
    if (fnError || data?.error) {
      setError(data?.error ?? fnError?.message ?? 'Could not create the user.')
      return
    }

    setEcode('')
    setFullName('')
    setRole('engineer')
    setSelectedFacilities([])
    load()
  }

  async function toggleActive(u: UserRow) {
    setBusyId(u.id)
    await supabase.from('profiles').update({ active: !u.active }).eq('id', u.id)
    setBusyId(null)
    load()
  }

  async function handleDelete(u: UserRow) {
    if (u.id === currentProfile?.id) return
    if (!window.confirm(`Permanently delete ${u.full_name} (${u.ecode})? This can't be undone.`)) return
    setBusyId(u.id)
    const { data, error: fnError } = await supabase.functions.invoke('admin-delete-user', {
      body: { user_id: u.id },
    })
    setBusyId(null)
    if (fnError || data?.error) {
      setError(data?.error ?? fnError?.message ?? 'Could not delete the user.')
      return
    }
    load()
  }

  function startReset(u: UserRow) {
    setResettingFor(u.id)
    setResetPassword('')
    setResetConfirm('')
    setResetError(null)
  }

  async function submitReset(userId: string) {
    setResetError(null)
    if (resetPassword.length < 8) {
      setResetError('Password must be at least 8 characters.')
      return
    }
    if (resetPassword !== resetConfirm) {
      setResetError("Passwords don't match.")
      return
    }
    setBusyId(userId)
    const { data, error: fnError } = await supabase.functions.invoke('admin-reset-password', {
      body: { user_id: userId, password: resetPassword },
    })
    setBusyId(null)
    if (fnError || data?.error) {
      setResetError(data?.error ?? fnError?.message ?? 'Could not reset the password.')
      return
    }
    setResettingFor(null)
  }

  function startEditFacilities(u: UserRow) {
    setEditingFacilitiesFor(u.id)
    setEditSelection(u.facilityIds)
  }

  async function saveFacilities(userId: string) {
    setBusyId(userId)
    await supabase.from('user_facilities').delete().eq('user_id', userId)
    if (editSelection.length > 0) {
      await supabase.from('user_facilities').insert(editSelection.map((facility_id) => ({ user_id: userId, facility_id })))
    }
    setBusyId(null)
    setEditingFacilitiesFor(null)
    load()
  }

  if (loading) return null

  const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <h1 className="mb-4 text-lg font-semibold text-slate-900">Users</h1>

      <form onSubmit={handleAdd} className="mb-6 space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-medium text-slate-700">Add a user</p>
        <div className="grid grid-cols-2 gap-2">
          <input
            required
            minLength={6}
            placeholder="Employee code (min 6 chars)"
            value={ecode}
            onChange={(e) => setEcode(e.target.value)}
            className={inputClass}
          />
          <select value={role} onChange={(e) => setRole(e.target.value as AppRole)} className={inputClass}>
            {Object.entries(ROLE_LABEL).map(([value, l]) => (
              <option key={value} value={value}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <input required placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} />
        <p className="text-xs text-slate-500">
          Default password is the employee code (min 6 characters). The user should change it after first login.
        </p>

        <div>
          <p className="mb-1 text-xs font-medium text-slate-500">Facilities</p>
          <div className="flex flex-wrap gap-2">
            {facilities.map((f) => (
              <label key={f.id} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1 text-xs">
                <input
                  type="checkbox"
                  checked={selectedFacilities.includes(f.id)}
                  onChange={(e) =>
                    setSelectedFacilities((sel) => (e.target.checked ? [...sel, f.id] : sel.filter((id) => id !== f.id)))
                  }
                  className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600"
                />
                {f.name}
              </label>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="flex items-center gap-1.5 rounded-lg bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60"
        >
          {submitting ? <SpinnerIcon className="h-4 w-4" /> : <PlusIcon className="h-4 w-4" />}
          Add user
        </button>
      </form>

      <ul className="space-y-2">
        {users.map((u) => (
          <li key={u.id} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-slate-900">
                  {u.full_name} <span className="font-normal text-slate-400">· {u.ecode}</span>
                </p>
                <p className="text-xs text-slate-500">{ROLE_LABEL[u.role]}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleActive(u)}
                  disabled={busyId === u.id}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    u.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {u.active ? 'Active' : 'Inactive'}
                </button>
                <button
                  onClick={() => startReset(u)}
                  disabled={busyId === u.id}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label={`Reset password for ${u.full_name}`}
                >
                  <KeyIcon className="h-4 w-4" />
                </button>
                {u.id !== currentProfile?.id && (
                  <button
                    onClick={() => handleDelete(u)}
                    disabled={busyId === u.id}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    aria-label={`Delete ${u.full_name}`}
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            {resettingFor === u.id && (
              <div className="mt-2 space-y-2 border-t border-slate-100 pt-2">
                <input
                  type="password"
                  placeholder="New password (min 8 characters)"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  className={inputClass}
                />
                <input
                  type="password"
                  placeholder="Confirm new password"
                  value={resetConfirm}
                  onChange={(e) => setResetConfirm(e.target.value)}
                  className={inputClass}
                />
                {resetError && <p className="text-xs text-red-600">{resetError}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={() => submitReset(u.id)}
                    disabled={busyId === u.id}
                    className="rounded-lg bg-brand-700 px-3 py-1 text-xs font-medium text-white disabled:opacity-60"
                  >
                    Set password
                  </button>
                  <button
                    onClick={() => setResettingFor(null)}
                    className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-600"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {editingFacilitiesFor === u.id ? (
              <div className="mt-2 space-y-2 border-t border-slate-100 pt-2">
                <div className="flex flex-wrap gap-2">
                  {facilities.map((f) => (
                    <label key={f.id} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1 text-xs">
                      <input
                        type="checkbox"
                        checked={editSelection.includes(f.id)}
                        onChange={(e) =>
                          setEditSelection((sel) => (e.target.checked ? [...sel, f.id] : sel.filter((id) => id !== f.id)))
                        }
                        className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600"
                      />
                      {f.name}
                    </label>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => saveFacilities(u.id)} className="rounded-lg bg-brand-700 px-3 py-1 text-xs font-medium text-white">
                    Save
                  </button>
                  <button onClick={() => setEditingFacilitiesFor(null)} className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-600">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => startEditFacilities(u)} className="mt-1.5 text-left text-xs text-slate-500 hover:text-brand-700">
                {u.facilityIds.length === 0
                  ? 'No facilities assigned — tap to assign'
                  : facilities
                      .filter((f) => u.facilityIds.includes(f.id))
                      .map((f) => f.name)
                      .join(', ')}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

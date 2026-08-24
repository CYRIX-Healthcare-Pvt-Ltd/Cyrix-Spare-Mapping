import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import { PlusIcon, TrashIcon, SpinnerIcon, KeyIcon, UploadIcon } from '../../components/icons'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { BulkUploadModal, type RowOutcome } from '../../components/BulkUploadModal'
import { FacilityMultiSelect } from '../../components/FacilityMultiSelect'
import type { ProfileRow, FacilityRow } from '../../types/app'
import type { AppRole } from '../../types/database'

const ROLE_LABEL: Record<AppRole, string> = {
  engineer: 'Engineer',
  project_manager: 'Project Manager',
  admin: 'Admin',
}

const VALID_ROLES: AppRole[] = ['engineer', 'project_manager', 'admin']

interface UserRow extends ProfileRow {
  facilityIds: string[]
}

interface UserImportRow {
  ecode: string
  full_name: string
  role: AppRole
  reports_to_ecode: string | null
  facility_names: string[]
}

function parseUserRow(raw: Record<string, string>): { data: UserImportRow } | { error: string } {
  const ecode = raw.ecode?.trim()
  const full_name = raw.full_name?.trim()
  if (!ecode) return { error: 'ecode is required' }
  if (!full_name) return { error: 'full_name is required' }

  const roleRaw = raw.role?.trim()
  if (!roleRaw) return { error: 'role is required' }
  const roleKey = roleRaw.toLowerCase().replace(/[\s-]+/g, '_') as AppRole
  if (!VALID_ROLES.includes(roleKey)) {
    return { error: `Invalid role "${roleRaw}" (use engineer, project_manager, or admin)` }
  }

  const facility_names = (raw.facility_names ?? '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)

  return {
    data: {
      ecode,
      full_name,
      role: roleKey,
      reports_to_ecode: raw.reports_to_ecode?.trim() || null,
      facility_names,
    },
  }
}

export default function Users() {
  const { profile: currentProfile } = useAuth()
  const [users, setUsers] = useState<UserRow[]>([])
  const [facilities, setFacilities] = useState<FacilityRow[]>([])
  const [loading, setLoading] = useState(true)

  const [ecode, setEcode] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<AppRole>('engineer')
  const [reportsTo, setReportsTo] = useState('')
  const [selectedFacilities, setSelectedFacilities] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdPassword, setCreatedPassword] = useState<{ ecode: string; password: string } | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [editingFacilitiesFor, setEditingFacilitiesFor] = useState<string | null>(null)
  const [editSelection, setEditSelection] = useState<string[]>([])
  const [resettingFor, setResettingFor] = useState<string | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetConfirm, setResetConfirm] = useState('')
  const [resetError, setResetError] = useState<string | null>(null)
  const [editingManagerFor, setEditingManagerFor] = useState<string | null>(null)
  const [managerSelection, setManagerSelection] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<UserRow | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)

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
    setCreatedPassword(null)

    const { data, error: fnError } = await supabase.functions.invoke('admin-create-user', {
      body: {
        ecode,
        full_name: fullName,
        role,
        facility_ids: selectedFacilities,
        reports_to: role === 'engineer' && reportsTo ? reportsTo : undefined,
      },
    })

    setSubmitting(false)
    if (fnError || data?.error) {
      setError(data?.error ?? fnError?.message ?? 'Could not create the user.')
      return
    }

    setCreatedPassword({ ecode, password: data.password })
    setEcode('')
    setFullName('')
    setRole('engineer')
    setReportsTo('')
    setSelectedFacilities([])
    load()
  }

  async function toggleActive(u: UserRow) {
    setBusyId(u.id)
    await supabase.from('profiles').update({ active: !u.active }).eq('id', u.id)
    setBusyId(null)
    load()
  }

  async function performDelete() {
    if (!confirmDelete || confirmDelete.id === currentProfile?.id) return
    setBusyId(confirmDelete.id)
    const { data, error: fnError } = await supabase.functions.invoke('admin-delete-user', {
      body: { user_id: confirmDelete.id },
    })
    setBusyId(null)
    setConfirmDelete(null)
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
    if (resetPassword.length < 6) {
      setResetError('Password must be at least 6 characters.')
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

  function startEditManager(u: UserRow) {
    setEditingManagerFor(u.id)
    setManagerSelection(u.reports_to ?? '')
  }

  async function saveManager(userId: string) {
    setBusyId(userId)
    await supabase.from('profiles').update({ reports_to: managerSelection || null }).eq('id', userId)
    setBusyId(null)
    setEditingManagerFor(null)
    load()
  }

  async function submitUserRows(
    rows: UserImportRow[],
    onProgress: (done: number, total: number) => void
  ): Promise<RowOutcome[]> {
    const ecodeToId = new Map(users.map((u) => [u.ecode.toLowerCase(), u.id]))
    const facilityByName = new Map(facilities.map((f) => [f.name.toLowerCase(), f.id]))

    const outcomes: RowOutcome[] = []
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const warnings: string[] = []

      let reportsTo: string | undefined
      if (row.role === 'engineer' && row.reports_to_ecode) {
        const id = ecodeToId.get(row.reports_to_ecode.toLowerCase())
        if (id) reportsTo = id
        else warnings.push(`manager "${row.reports_to_ecode}" not found`)
      }

      const facility_ids: string[] = []
      for (const name of row.facility_names) {
        const id = facilityByName.get(name.toLowerCase())
        if (id) facility_ids.push(id)
        else warnings.push(`warehouse "${name}" not found`)
      }

      const { data, error: fnError } = await supabase.functions.invoke('admin-create-user', {
        body: { ecode: row.ecode, full_name: row.full_name, role: row.role, facility_ids, reports_to: reportsTo },
      })

      if (fnError || data?.error) {
        outcomes.push({ status: 'error', message: data?.error ?? fnError?.message ?? 'Could not create user' })
      } else {
        ecodeToId.set(row.ecode.toLowerCase(), data.id)
        const base = `Created — password ${data.password}`
        outcomes.push({ status: 'ok', message: warnings.length ? `${base} (${warnings.join('; ')})` : base })
      }
      onProgress(i + 1, rows.length)
    }
    return outcomes
  }

  if (loading) return null

  const managers = users.filter((u) => u.role === 'project_manager')

  const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-6 sm:max-w-3xl sm:px-6 lg:py-8">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-slate-900">Users</h1>
        <button
          type="button"
          onClick={() => setBulkOpen(true)}
          className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <UploadIcon className="h-3.5 w-3.5" /> Bulk upload
        </button>
      </div>

      <form onSubmit={handleAdd} className="mb-6 space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-medium text-slate-700">Add a user</p>
        <div className="grid grid-cols-2 gap-2">
          <input
            required
            placeholder="Employee code"
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

        {role === 'engineer' && (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Reporting manager</label>
            <select value={reportsTo} onChange={(e) => setReportsTo(e.target.value)} className={inputClass}>
              <option value="">No manager assigned</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.ecode} — {m.full_name}
                </option>
              ))}
            </select>
            {managers.length === 0 && (
              <p className="mt-1 text-xs text-amber-600">No project managers exist yet — add one first if you want to assign one.</p>
            )}
          </div>
        )}
        <p className="text-xs text-slate-500">
          Default password for every new user is <strong>123456</strong>. They should change it after first
          login (Account page), or you can set a specific one anytime via the key icon below.
        </p>

        <div>
          <p className="mb-1 text-xs font-medium text-slate-500">Warehouses</p>
          <FacilityMultiSelect facilities={facilities} selected={selectedFacilities} onChange={setSelectedFacilities} />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="flex items-center gap-1.5 rounded-lg bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-650 disabled:opacity-60"
        >
          {submitting ? <SpinnerIcon className="h-4 w-4" /> : <PlusIcon className="h-4 w-4" />}
          Add user
        </button>
        {createdPassword && (
          <p className="rounded-lg bg-emerald-50 p-2 text-xs text-emerald-700">
            Created <strong>{createdPassword.ecode}</strong> — default password:{' '}
            <strong className="font-mono">{createdPassword.password}</strong>
          </p>
        )}
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
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    u.active ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {u.active ? 'Active' : 'Inactive'}
                </button>
                <button
                  onClick={() => startReset(u)}
                  disabled={busyId === u.id}
                  className="rounded-lg p-1.5 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                  aria-label={`Reset password for ${u.full_name}`}
                >
                  <KeyIcon className="h-4 w-4" />
                </button>
                {u.id !== currentProfile?.id && (
                  <button
                    onClick={() => setConfirmDelete(u)}
                    disabled={busyId === u.id}
                    className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 hover:text-red-700"
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
                  placeholder="New password (min 6 characters)"
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
                <FacilityMultiSelect facilities={facilities} selected={editSelection} onChange={setEditSelection} />
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
                {u.facilityIds.length === 0 ? (
                  'No warehouses assigned — tap to assign'
                ) : (
                  <>
                    {facilities
                      .filter((f) => u.facilityIds.includes(f.id))
                      .slice(0, 4)
                      .map((f) => f.name)
                      .join(', ')}
                    {u.facilityIds.length > 4 && ` +${u.facilityIds.length - 4} more`}
                  </>
                )}
              </button>
            )}

            {u.role === 'engineer' &&
              (editingManagerFor === u.id ? (
                <div className="mt-2 space-y-2 border-t border-slate-100 pt-2">
                  <select value={managerSelection} onChange={(e) => setManagerSelection(e.target.value)} className={inputClass}>
                    <option value="">No manager assigned</option>
                    {managers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.ecode} — {m.full_name}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <button onClick={() => saveManager(u.id)} className="rounded-lg bg-brand-700 px-3 py-1 text-xs font-medium text-white">
                      Save
                    </button>
                    <button onClick={() => setEditingManagerFor(null)} className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-600">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => startEditManager(u)} className="mt-1.5 text-left text-xs text-slate-500 hover:text-brand-700">
                  Reports to:{' '}
                  {u.reports_to
                    ? (managers.find((m) => m.id === u.reports_to)?.full_name ?? 'Unknown')
                    : 'no one — tap to assign'}
                </button>
              ))}
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={!!confirmDelete}
        title={`Permanently delete ${confirmDelete?.full_name}?`}
        message={`Employee code ${confirmDelete?.ecode}. This can't be undone.`}
        busy={busyId === confirmDelete?.id}
        onConfirm={performDelete}
        onCancel={() => setConfirmDelete(null)}
      />

      <BulkUploadModal<UserImportRow>
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title="Bulk upload users"
        description="Import many users at once from a CSV file. Every new login gets the default password 123456."
        templateFilename="users_template.csv"
        templateHeaders={['ecode', 'full_name', 'role', 'reports_to_ecode', 'facility_names']}
        templateSampleRows={[['E2001', 'Jane Doe', 'engineer', 'E1001', 'GH Ekm; City Hospital']]}
        parseRow={(raw) => parseUserRow(raw)}
        submitRows={submitUserRows}
        onImported={load}
      />
    </div>
  )
}

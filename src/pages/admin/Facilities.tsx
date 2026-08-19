import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import { PlusIcon, TrashIcon, SpinnerIcon } from '../../components/icons'
import type { FacilityRow } from '../../types/app'

export default function Facilities() {
  const { profile } = useAuth()
  const [facilities, setFacilities] = useState<FacilityRow[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('facilities').select('*').order('name')
    setFacilities(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const { error: insertError } = await supabase
      .from('facilities')
      .insert({ name, address: address || null, city: city || null, created_by: profile?.id })
    setSubmitting(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    setName('')
    setAddress('')
    setCity('')
    load()
  }

  async function toggleActive(f: FacilityRow) {
    await supabase.from('facilities').update({ active: !f.active }).eq('id', f.id)
    load()
  }

  async function handleDelete(f: FacilityRow) {
    const { count } = await supabase
      .from('equipment')
      .select('id', { count: 'exact', head: true })
      .eq('facility_id', f.id)

    if ((count ?? 0) > 0) {
      setError(`Can't delete "${f.name}" — ${count} equipment record(s) still reference it. Deactivate it instead.`)
      return
    }
    if (!window.confirm(`Delete facility "${f.name}"? This can't be undone.`)) return

    const { error: deleteError } = await supabase.from('facilities').delete().eq('id', f.id)
    if (deleteError) setError(deleteError.message)
    load()
  }

  if (loading) return null

  const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <h1 className="mb-4 text-lg font-semibold text-slate-900">Facilities</h1>

      <form onSubmit={handleAdd} className="mb-6 space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-medium text-slate-700">Add a facility</p>
        <input required placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        <div className="grid grid-cols-2 gap-2">
          <input placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} className={inputClass} />
          <input placeholder="Address" value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="flex items-center gap-1.5 rounded-lg bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60"
        >
          {submitting ? <SpinnerIcon className="h-4 w-4" /> : <PlusIcon className="h-4 w-4" />}
          Add facility
        </button>
      </form>

      <ul className="space-y-2">
        {facilities.map((f) => (
          <li key={f.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
            <div>
              <p className="font-medium text-slate-900">{f.name}</p>
              <p className="text-xs text-slate-500">{[f.city, f.address].filter(Boolean).join(' · ') || '—'}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => toggleActive(f)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  f.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {f.active ? 'Active' : 'Inactive'}
              </button>
              <button
                onClick={() => handleDelete(f)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                aria-label={`Delete ${f.name}`}
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

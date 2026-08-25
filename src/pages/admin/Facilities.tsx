import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import { PlusIcon, TrashIcon, SpinnerIcon, UploadIcon, PencilIcon } from '../../components/icons'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { BulkUploadModal, type RowOutcome } from '../../components/BulkUploadModal'
import type { FacilityRow } from '../../types/app'

// A warehouse is a name and where it sits, nothing more -- no address, no
// coordinates. The app records which warehouse a spare is in; it does not
// track where anyone or anything physically is.
interface FacilityImportRow {
  name: string
  district: string | null
  city: string | null
}

interface FacilityValues {
  name: string
  district: string | null
  city: string
}

function parseFacilityRow(raw: Record<string, string>): { data: FacilityImportRow } | { error: string } {
  const name = raw.name?.trim()
  if (!name) return { error: 'Name is required' }

  return {
    data: {
      name,
      district: raw.district?.trim() || null,
      city: raw.city?.trim() || null,
    },
  }
}

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

// Shared by the "add a warehouse" card and each row's inline "edit" mode --
// same fields, just a different initial state and what happens on submit.
function FacilityEditor({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: FacilityValues
  submitLabel: string
  onSubmit: (values: FacilityValues) => Promise<string | null>
  onCancel?: () => void
}) {
  const [name, setName] = useState(initial.name)
  const [city, setCity] = useState(initial.city)
  const [district, setDistrict] = useState<string | null>(initial.district)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const submitError = await onSubmit({ name, district, city })
    setSubmitting(false)
    if (submitError) {
      setError(submitError)
      return
    }
    if (onCancel) {
      onCancel()
    } else {
      setName('')
      setCity('')
      setDistrict(null)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <input required placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />

      {/* Broadest to narrowest: a district contains cities, so that's the
          order they're asked for. */}
      <div className="grid grid-cols-2 gap-2">
        <input
          placeholder="District"
          value={district ?? ''}
          onChange={(e) => setDistrict(e.target.value || null)}
          className={inputClass}
        />
        <input placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} className={inputClass} />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="flex items-center gap-1.5 rounded-lg bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-650 disabled:opacity-60"
        >
          {submitting ? <SpinnerIcon className="h-4 w-4" /> : <PlusIcon className="h-4 w-4" />}
          {submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}

export default function Facilities() {
  const { profile } = useAuth()
  const [facilities, setFacilities] = useState<FacilityRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<FacilityRow | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('facilities').select('*').order('name')
    setFacilities(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleAddSubmit(values: FacilityValues): Promise<string | null> {
    const { error: insertError } = await supabase.from('facilities').insert({ ...values, created_by: profile?.id })
    if (insertError) return insertError.message
    await load()
    return null
  }

  async function handleEditSubmit(facilityId: string, values: FacilityValues): Promise<string | null> {
    const { error: updateError } = await supabase.from('facilities').update(values).eq('id', facilityId)
    if (updateError) return updateError.message
    await load()
    return null
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
      setError(`Can't delete "${f.name}" — ${count} record(s) still reference it. Deactivate it instead.`)
      return
    }
    setConfirmDelete(f)
  }

  async function performDelete() {
    if (!confirmDelete) return
    const { error: deleteError } = await supabase.from('facilities').delete().eq('id', confirmDelete.id)
    if (deleteError) setError(deleteError.message)
    setConfirmDelete(null)
    load()
  }

  async function submitFacilityRows(
    rows: FacilityImportRow[],
    onProgress: (done: number, total: number) => void
  ): Promise<RowOutcome[]> {
    const outcomes: RowOutcome[] = new Array(rows.length)
    const chunkSize = 500
    let done = 0
    for (let start = 0; start < rows.length; start += chunkSize) {
      const chunk = rows.slice(start, start + chunkSize)
      const { error: insertError } = await supabase
        .from('facilities')
        .insert(chunk.map((r) => ({ ...r, created_by: profile?.id })))
      for (let i = 0; i < chunk.length; i++) {
        outcomes[start + i] = insertError
          ? { status: 'error', message: insertError.message }
          : { status: 'ok', message: 'Created' }
      }
      done += chunk.length
      onProgress(done, rows.length)
    }
    return outcomes
  }

  if (loading) return null

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-6 sm:max-w-3xl sm:px-6 lg:py-8">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-slate-900">Warehouses</h1>
        <button
          type="button"
          onClick={() => setBulkOpen(true)}
          className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <UploadIcon className="h-3.5 w-3.5" /> Bulk upload
        </button>
      </div>

      <div className="mb-6">
        <p className="mb-2 text-sm font-medium text-slate-700">Add a warehouse</p>
        <FacilityEditor
          initial={{ name: '', district: null, city: '' }}
          submitLabel="Add warehouse"
          onSubmit={handleAddSubmit}
        />
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <ul className="space-y-2">
        {facilities.map((f) =>
          editingId === f.id ? (
            <li key={f.id}>
              <FacilityEditor
                initial={{ name: f.name, district: f.district, city: f.city ?? '' }}
                submitLabel="Save changes"
                onSubmit={(values) => handleEditSubmit(f.id, values)}
                onCancel={() => setEditingId(null)}
              />
            </li>
          ) : (
            <li key={f.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
              <div className="min-w-0">
                <p className="font-medium text-slate-900">{f.name}</p>
                <p className="truncate text-xs text-slate-500">
                  {[f.district, f.city].filter(Boolean).join(' · ') || '—'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => toggleActive(f)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    f.active ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {f.active ? 'Active' : 'Inactive'}
                </button>
                <button
                  onClick={() => setEditingId(f.id)}
                  className="rounded-lg p-1.5 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                  aria-label={`Edit ${f.name}`}
                >
                  <PencilIcon className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDelete(f)}
                  className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 hover:text-red-700"
                  aria-label={`Delete ${f.name}`}
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            </li>
          )
        )}
      </ul>

      <ConfirmDialog
        open={!!confirmDelete}
        title={`Delete warehouse "${confirmDelete?.name}"?`}
        message="This can't be undone."
        onConfirm={performDelete}
        onCancel={() => setConfirmDelete(null)}
      />

      <BulkUploadModal<FacilityImportRow>
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title="Bulk upload warehouses"
        description="Import many warehouses at once from a CSV file."
        templateFilename="warehouses_template.csv"
        templateHeaders={['name', 'district', 'city']}
        templateSampleRows={[['WH Ekm', 'Ernakulam', 'Kochi']]}
        parseRow={(raw) => parseFacilityRow(raw)}
        submitRows={submitFacilityRows}
        onImported={load}
      />
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import { getCurrentPosition, reverseGeocode, geolocationErrorMessage } from '../../lib/geolocate'
import { PlusIcon, TrashIcon, SpinnerIcon, MapPinIcon, UploadIcon, PencilIcon } from '../../components/icons'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { BulkUploadModal, type RowOutcome } from '../../components/BulkUploadModal'
import type { FacilityRow } from '../../types/app'

interface FacilityImportRow {
  name: string
  district: string | null
  city: string | null
  address: string | null
  latitude: number | null
  longitude: number | null
}

interface FacilityValues {
  name: string
  district: string | null
  city: string
  address: string | null
  latitude: number | null
  longitude: number | null
}

function parseFacilityRow(raw: Record<string, string>): { data: FacilityImportRow } | { error: string } {
  const name = raw.name?.trim()
  if (!name) return { error: 'Name is required' }

  const parseCoord = (value: string | undefined) => {
    if (!value || !value.trim()) return { ok: true as const, value: null }
    const n = Number(value)
    return Number.isFinite(n) ? { ok: true as const, value: n } : { ok: false as const, value: null }
  }
  const latitude = parseCoord(raw.latitude)
  if (!latitude.ok) return { error: `Invalid latitude "${raw.latitude}"` }
  const longitude = parseCoord(raw.longitude)
  if (!longitude.ok) return { error: `Invalid longitude "${raw.longitude}"` }

  return {
    data: {
      name,
      district: raw.district?.trim() || null,
      city: raw.city?.trim() || null,
      address: raw.address?.trim() || null,
      latitude: latitude.value,
      longitude: longitude.value,
    },
  }
}

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

// Shared by the "add a facility" card and each row's inline "edit" mode --
// same fields, same GPS-capture flow, just a different initial state and
// what happens on submit.
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
  const [address, setAddress] = useState(initial.address ?? '')
  const [city, setCity] = useState(initial.city)
  const [district, setDistrict] = useState<string | null>(initial.district)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    initial.latitude != null && initial.longitude != null ? { lat: initial.latitude, lng: initial.longitude } : null
  )
  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleUseLocation() {
    setLocating(true)
    setLocateError(null)
    try {
      const position = await getCurrentPosition()
      const located = await reverseGeocode(position.coords.latitude, position.coords.longitude)
      setAddress(located.address)
      if (located.city) setCity(located.city)
      setDistrict(located.district)
      setCoords({ lat: located.latitude, lng: located.longitude })
    } catch (err) {
      setLocateError(err instanceof Error && err.message.includes('resolve') ? err.message : geolocationErrorMessage(err))
    } finally {
      setLocating(false)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const values: FacilityValues = {
      name,
      district,
      city,
      address: address || null,
      latitude: coords?.lat ?? null,
      longitude: coords?.lng ?? null,
    }
    const submitError = await onSubmit(values)
    setSubmitting(false)
    if (submitError) {
      setError(submitError)
      return
    }
    if (onCancel) {
      onCancel()
    } else {
      setName('')
      setAddress('')
      setCity('')
      setDistrict(null)
      setCoords(null)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <input required placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />

      {/* Broadest to narrowest: district contains cities, a city contains the
          specific address/pin — so that's the order fields appear and fill in. */}
      <div className="grid grid-cols-2 gap-2">
        <input
          placeholder="District"
          value={district ?? ''}
          onChange={(e) => setDistrict(e.target.value || null)}
          className={inputClass}
        />
        <input placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} className={inputClass} />
      </div>
      <p className="text-xs text-slate-400">District and city are auto-filled by GPS below — edit if they're off.</p>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Address</label>
        {address ? (
          <div className="flex items-start justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <span>{address}</span>
            <MapPinIcon className="h-4 w-4 shrink-0 text-emerald-600" />
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-400">No location set yet</p>
        )}
        <button
          type="button"
          onClick={handleUseLocation}
          disabled={locating}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          {locating ? <SpinnerIcon className="h-3.5 w-3.5" /> : <MapPinIcon className="h-3.5 w-3.5" />}
          {locating ? 'Locating…' : address ? 'Re-capture with GPS' : 'Use GPS to set location'}
        </button>
        {coords && (
          <p className="mt-1 text-xs text-slate-400">
            {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
          </p>
        )}
        {locateError && <p className="mt-1 text-xs text-red-600">{locateError}</p>}
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
          initial={{ name: '', district: null, city: '', address: null, latitude: null, longitude: null }}
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
                initial={{ name: f.name, district: f.district, city: f.city ?? '', address: f.address, latitude: f.latitude, longitude: f.longitude }}
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
                  {[f.district, f.city, f.address].filter(Boolean).join(' · ') || '—'}
                </p>
                {f.latitude != null && f.longitude != null && (
                  <a
                    href={`https://www.google.com/maps?q=${f.latitude},${f.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-0.5 inline-flex items-center gap-1 text-xs text-brand-700 hover:underline"
                  >
                    <MapPinIcon className="h-3 w-3" /> View on map
                  </a>
                )}
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
        templateHeaders={['name', 'district', 'city', 'address', 'latitude', 'longitude']}
        templateSampleRows={[['General Hospital', 'Ernakulam', 'Kochi', 'MG Road', '9.9816', '76.2999']]}
        parseRow={(raw) => parseFacilityRow(raw)}
        submitRows={submitFacilityRows}
        onImported={load}
      />
    </div>
  )
}

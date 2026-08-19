import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import { getCurrentPosition, reverseGeocode, geolocationErrorMessage } from '../../lib/geolocate'
import { PlusIcon, TrashIcon, SpinnerIcon, MapPinIcon } from '../../components/icons'
import type { FacilityRow } from '../../types/app'

export default function Facilities() {
  const { profile } = useAuth()
  const [facilities, setFacilities] = useState<FacilityRow[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [district, setDistrict] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState<string | null>(null)
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

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const { error: insertError } = await supabase.from('facilities').insert({
      name,
      address: address || null,
      city: city || null,
      district,
      latitude: coords?.lat ?? null,
      longitude: coords?.lng ?? null,
      created_by: profile?.id,
    })
    setSubmitting(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    setName('')
    setAddress('')
    setCity('')
    setDistrict(null)
    setCoords(null)
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
            <p className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-400">
              No location set yet
            </p>
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

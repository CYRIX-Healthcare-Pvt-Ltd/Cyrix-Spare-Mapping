import { useEffect, useState } from 'react'
import { PlusIcon, SpinnerIcon } from './icons'
import type { FacilityRow } from '../types/app'

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

/**
 * A single searchable (datalist-backed) warehouse combo. District and city
 * still live on the warehouse record -- admin sets them and the tagged list
 * reports them -- but they were dropped as separate pickers here: everything
 * the tagger fills in should come from the admin-defined custom fields, and
 * searching warehouses by name is enough to find one.
 */
export function FacilityPicker({
  facilities,
  value,
  onChange,
  onCreateFacility,
}: {
  facilities: FacilityRow[]
  value: string
  onChange: (facilityId: string) => void
  onCreateFacility?: (input: { name: string; district: string | null; city: string | null }) => Promise<FacilityRow>
}) {
  const [facilityText, setFacilityText] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Stay in sync if the selected facility changes from outside (e.g. only
  // one facility exists and the parent auto-selected it).
  useEffect(() => {
    const f = facilities.find((x) => x.id === value)
    if (f) setFacilityText(f.name)
    else if (!value) setFacilityText('')
  }, [value, facilities])

  const facilitiesFiltered = facilities

  function handleFacilityTextChange(text: string) {
    setFacilityText(text)
    setCreateError(null)
    const match = facilitiesFiltered.find((f) => f.name.toLowerCase() === text.toLowerCase())
    onChange(match ? match.id : '')
  }

  async function handleCreate() {
    if (!onCreateFacility || !facilityText.trim()) return
    setCreating(true)
    setCreateError(null)
    try {
      // District and city are left null here -- the GPS capture inside
      // onCreateFacility reverse-geocodes them, which is more reliable than
      // anything typed on the tag form.
      const created = await onCreateFacility({ name: facilityText.trim(), district: null, city: null })
      onChange(created.id)
      setFacilityText(created.name)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Could not add this warehouse.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Warehouse *</label>
        <input
          required
          list="facility-picker-facilities"
          value={facilityText}
          onChange={(e) => handleFacilityTextChange(e.target.value)}
          placeholder="Search or select a warehouse…"
          className={inputClass}
        />
        <datalist id="facility-picker-facilities">
          {facilitiesFiltered.map((f) => (
            <option key={f.id} value={f.name} />
          ))}
        </datalist>
        {facilityText && !value && (
          <div className="mt-1.5">
            <p className="text-xs text-amber-600">No warehouse matches that name exactly.</p>
            {onCreateFacility && (
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                className="mt-1.5 flex items-center gap-1.5 rounded-lg border border-brand-200 px-2.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-60"
              >
                {creating ? <SpinnerIcon className="h-3.5 w-3.5" /> : <PlusIcon className="h-3.5 w-3.5" />}
                {creating ? 'Capturing location…' : `Add "${facilityText}" as a new warehouse`}
              </button>
            )}
            {createError && <p className="mt-1 text-xs text-red-600">{createError}</p>}
          </div>
        )}
      </div>
    </div>
  )
}

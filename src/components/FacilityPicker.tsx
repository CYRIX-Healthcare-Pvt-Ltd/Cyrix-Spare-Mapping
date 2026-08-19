import { useEffect, useMemo, useState } from 'react'
import type { FacilityRow } from '../types/app'

function uniqueSorted(values: (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b))
}

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

/**
 * District -> City -> Facility, each a searchable (datalist-backed) combo,
 * kept in sync in both directions: narrowing district/city narrows which
 * facilities are offered (and auto-picks the facility if only one matches),
 * while picking a facility directly fills in its own district/city.
 */
export function FacilityPicker({
  facilities,
  value,
  onChange,
}: {
  facilities: FacilityRow[]
  value: string
  onChange: (facilityId: string) => void
}) {
  const [district, setDistrict] = useState('')
  const [city, setCity] = useState('')
  const [facilityText, setFacilityText] = useState('')

  // Stay in sync if the selected facility changes from outside (e.g. only
  // one facility exists and the parent auto-selected it).
  useEffect(() => {
    const f = facilities.find((x) => x.id === value)
    if (f) {
      setDistrict(f.district ?? '')
      setCity(f.city ?? '')
      setFacilityText(f.name)
    } else if (!value) {
      setFacilityText('')
    }
  }, [value, facilities])

  const districts = useMemo(() => uniqueSorted(facilities.map((f) => f.district)), [facilities])

  const citiesForDistrict = useMemo(
    () => uniqueSorted(facilities.filter((f) => !district || f.district === district).map((f) => f.city)),
    [facilities, district]
  )

  const facilitiesFiltered = useMemo(
    () => facilities.filter((f) => (!district || f.district === district) && (!city || f.city === city)),
    [facilities, district, city]
  )

  function pickIfUnique(matches: FacilityRow[]) {
    if (matches.length === 1) {
      onChange(matches[0].id)
      setFacilityText(matches[0].name)
    } else if (!matches.some((f) => f.id === value)) {
      onChange('')
      setFacilityText('')
    }
  }

  function handleDistrictChange(next: string) {
    setDistrict(next)
    const citiesNow = uniqueSorted(facilities.filter((f) => !next || f.district === next).map((f) => f.city))
    const nextCity = citiesNow.includes(city) ? city : ''
    setCity(nextCity)
    pickIfUnique(facilities.filter((f) => (!next || f.district === next) && (!nextCity || f.city === nextCity)))
  }

  function handleCityChange(next: string) {
    setCity(next)
    pickIfUnique(facilities.filter((f) => (!district || f.district === district) && (!next || f.city === next)))
  }

  function handleFacilityTextChange(text: string) {
    setFacilityText(text)
    const match = facilitiesFiltered.find((f) => f.name.toLowerCase() === text.toLowerCase())
    if (match) {
      onChange(match.id)
      setDistrict(match.district ?? '')
      setCity(match.city ?? '')
    } else {
      onChange('')
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">District</label>
          <input
            list="facility-picker-districts"
            value={district}
            onChange={(e) => handleDistrictChange(e.target.value)}
            placeholder="Any"
            className={inputClass}
          />
          <datalist id="facility-picker-districts">
            {districts.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">City</label>
          <input
            list="facility-picker-cities"
            value={city}
            onChange={(e) => handleCityChange(e.target.value)}
            placeholder="Any"
            className={inputClass}
          />
          <datalist id="facility-picker-cities">
            {citiesForDistrict.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Facility *</label>
        <input
          required
          list="facility-picker-facilities"
          value={facilityText}
          onChange={(e) => handleFacilityTextChange(e.target.value)}
          placeholder="Search or select a facility…"
          className={inputClass}
        />
        <datalist id="facility-picker-facilities">
          {facilitiesFiltered.map((f) => (
            <option key={f.id} value={f.name} />
          ))}
        </datalist>
        {facilityText && !value && (
          <p className="mt-1 text-xs text-amber-600">No facility matches that name exactly — pick one from the list.</p>
        )}
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { EquipmentForm } from '../components/EquipmentForm'
import { fetchFieldSuggestions } from '../lib/fieldSuggestions'
import { getCurrentPosition, reverseGeocode } from '../lib/geolocate'
import { haversineDistanceMeters, formatDistance, DISTANCE_WARNING_METERS } from '../lib/distance'
import { ChevronLeftIcon, AlertIcon } from '../components/icons'
import type { FacilityRow, FieldDefinitionRow, EquipmentFormValues } from '../types/app'

interface Coords {
  lat: number
  lng: number
}

export default function EquipmentNew() {
  const { profile, refreshProfile } = useAuth()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const qr = searchParams.get('qr')

  const [facilities, setFacilities] = useState<FacilityRow[]>([])
  const [fieldDefs, setFieldDefs] = useState<FieldDefinitionRow[]>([])
  const [suggestions, setSuggestions] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [distanceWarning, setDistanceWarning] = useState<string | null>(null)
  const [pendingSubmit, setPendingSubmit] = useState<{ values: EquipmentFormValues; position: Coords | null } | null>(null)

  useEffect(() => {
    if (!profile) return
    const currentProfile = profile

    async function load() {
      const [{ data: allFacilities }, { data: fields }, fieldSuggestions] = await Promise.all([
        supabase.from('facilities').select('*').eq('active', true).order('name'),
        supabase.from('field_definitions').select('*').eq('active', true).order('display_order'),
        fetchFieldSuggestions(),
      ])
      const scoped =
        currentProfile.role === 'admin'
          ? (allFacilities ?? [])
          : (allFacilities ?? []).filter((f) => currentProfile.facilityIds.includes(f.id))
      setFacilities(scoped)
      setFieldDefs(fields ?? [])
      setSuggestions(fieldSuggestions)
      setLoading(false)
    }
    load()
  }, [profile])

  async function performInsert(values: EquipmentFormValues, position: Coords | null) {
    if (!qr || !profile) return
    setSubmitting(true)
    setError(null)

    // No hardcoded "name" field is collected anymore -- the facility already
    // carries an address (captured via GPS in Admin -> Facilities), so a
    // free-typed location is redundant. This label is just so the record
    // has something to be identified by in lists; admins can add a "Name"
    // custom field if they want engineers choosing their own label.
    const facility = facilities.find((f) => f.id === values.facility_id)
    const autoName = facility ? `${facility.name} · ${qr}` : qr

    const { data, error: insertError } = await supabase
      .from('equipment')
      .insert({
        qr_value: qr,
        facility_id: values.facility_id,
        name: autoName,
        location: '',
        custom_fields: values.custom_fields,
        tag_latitude: position?.lat ?? null,
        tag_longitude: position?.lng ?? null,
        created_by: profile.id,
      })
      .select('id')
      .single()

    setSubmitting(false)

    if (insertError || !data) {
      setError(
        insertError?.code === '23505'
          ? 'This QR code is already mapped to a piece of equipment.'
          : `Could not save: ${insertError?.message ?? 'unknown error'}`
      )
      return
    }

    await supabase.from('equipment_history').insert({
      equipment_id: data.id,
      action: 'created',
      changes: { facility_id: values.facility_id, custom_fields: values.custom_fields },
      performed_by: profile.id,
      latitude: position?.lat ?? null,
      longitude: position?.lng ?? null,
    })

    // First tag at a facility with no recorded GPS yet establishes its
    // location -- covers facilities added from the field (before an admin
    // gets to it) and ones that came in via bulk upload without coordinates.
    if (position && facility && facility.latitude == null && facility.longitude == null) {
      const geo = await reverseGeocode(position.lat, position.lng).catch(() => null)
      await supabase
        .from('facilities')
        .update({
          latitude: position.lat,
          longitude: position.lng,
          address: facility.address ?? geo?.address ?? null,
          district: facility.district ?? geo?.district ?? null,
          city: facility.city ?? geo?.city ?? null,
        })
        .eq('id', facility.id)
    }

    navigate(`/equipment/${data.id}`, { replace: true })
  }

  async function handleSubmit(values: EquipmentFormValues) {
    setSubmitting(true)
    setError(null)

    let position: Coords | null = null
    try {
      const pos = await getCurrentPosition()
      position = { lat: pos.coords.latitude, lng: pos.coords.longitude }
    } catch {
      // GPS is best-effort -- never blocks tagging on its own.
    }

    const facility = facilities.find((f) => f.id === values.facility_id)
    if (position && facility?.latitude != null && facility?.longitude != null) {
      const distance = haversineDistanceMeters(position.lat, position.lng, facility.latitude, facility.longitude)
      if (distance > DISTANCE_WARNING_METERS) {
        setSubmitting(false)
        setPendingSubmit({ values, position })
        setDistanceWarning(formatDistance(distance))
        return
      }
    }

    await performInsert(values, position)
  }

  async function confirmTagAnyway() {
    if (!pendingSubmit) return
    setDistanceWarning(null)
    await performInsert(pendingSubmit.values, pendingSubmit.position)
    setPendingSubmit(null)
  }

  async function handleCreateFacility(input: { name: string; district: string | null; city: string | null }): Promise<FacilityRow> {
    if (!profile) throw new Error('Not signed in.')

    let coords: Coords | null = null
    let geo: Awaited<ReturnType<typeof reverseGeocode>> | null = null
    try {
      const pos = await getCurrentPosition()
      coords = { lat: pos.coords.latitude, lng: pos.coords.longitude }
      geo = await reverseGeocode(coords.lat, coords.lng)
    } catch {
      // Proceed without GPS -- an admin can fill in the location later.
    }

    const { data, error: insertError } = await supabase
      .from('facilities')
      .insert({
        name: input.name,
        district: input.district ?? geo?.district ?? null,
        city: input.city ?? geo?.city ?? null,
        address: geo?.address ?? null,
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
        created_by: profile.id,
      })
      .select('*')
      .single()

    if (insertError || !data) throw new Error(insertError?.message ?? 'Could not add this facility.')

    await supabase.from('user_facilities').insert({ user_id: profile.id, facility_id: data.id })
    await refreshProfile()

    setFacilities((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
    return data
  }

  if (!qr) {
    return (
      <div className="mx-auto max-w-sm px-4 py-10 text-center">
        <AlertIcon className="mx-auto mb-3 h-8 w-8 text-amber-500" />
        <p className="mb-4 text-slate-600">Scan a QR code first to tag a new piece of equipment.</p>
        <Link to="/scan" className="font-medium text-brand-700 hover:underline">
          Go to scan
        </Link>
      </div>
    )
  }

  if (loading) return null

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <Link to="/scan" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ChevronLeftIcon className="h-4 w-4" /> Back
      </Link>
      <h1 className="mb-1 text-lg font-semibold text-slate-900">Tag new equipment</h1>
      <p className="mb-5 text-sm text-slate-500">
        Code: <span className="font-mono">{qr}</span>
      </p>

      {facilities.length === 0 && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          You aren't assigned to any facility yet — search below to add the one you're at now.
        </p>
      )}

      <EquipmentForm
        facilities={facilities}
        fieldDefs={fieldDefs}
        initialValues={{
          facility_id: facilities.length === 1 ? facilities[0].id : '',
          custom_fields: {},
        }}
        submitLabel="Save equipment"
        submitting={submitting}
        disabled={!!distanceWarning}
        suggestions={suggestions}
        onSubmit={handleSubmit}
        onCreateFacility={handleCreateFacility}
      />

      {distanceWarning && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="flex items-start gap-1.5 text-sm text-amber-800">
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
            You're {distanceWarning} from this facility's recorded location. Tag anyway?
          </p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={confirmTagAnyway}
              disabled={submitting}
              className="rounded-lg bg-brand-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
            >
              {submitting ? 'Saving…' : 'Tag anyway'}
            </button>
            <button
              onClick={() => {
                setDistanceWarning(null)
                setPendingSubmit(null)
              }}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  )
}

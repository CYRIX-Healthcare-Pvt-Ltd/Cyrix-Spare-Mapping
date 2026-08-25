import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { EquipmentForm } from '../components/EquipmentForm'
import { fetchFieldSuggestions } from '../lib/fieldSuggestions'
import { blueStarIdentityFromForm, upsertTaggedBlueStarItem } from '../lib/blueStarItem'
import { ChevronLeftIcon, AlertIcon } from '../components/icons'
import type { FacilityRow, FieldDefinitionRow, EquipmentFormValues } from '../types/app'

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
  // Set when the spare saved but its catalogue row did not, so the message
  // can link straight to the spare that now needs finishing off.
  const [savedId, setSavedId] = useState<string | null>(null)

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

  async function handleSubmit(values: EquipmentFormValues) {
    if (!qr || !profile) return
    setSubmitting(true)
    setError(null)

    // No hardcoded "name" field is collected anymore -- the warehouse already
    // identifies where the spare is, so a free-typed location is redundant.
    // This label is just so the record has something to be identified by in
    // lists; admins can add a "Name" custom field if they want engineers
    // choosing their own label.
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
        created_by: profile.id,
      })
      .select('id')
      .single()

    setSubmitting(false)

    if (insertError || !data) {
      setError(
        insertError?.code === '23505'
          ? 'This QR code is already mapped to a spare.'
          : `Could not save: ${insertError?.message ?? 'unknown error'}`
      )
      return
    }

    await supabase.from('equipment_history').insert({
      equipment_id: data.id,
      action: 'created',
      changes: { facility_id: values.facility_id, custom_fields: values.custom_fields },
      performed_by: profile.id,
    })

    // Everything tagged here is one of Blue Star's spares, so the tag has to
    // reach their catalogue -- that's where the Cyrix link lives, and it's
    // what makes the item list reflect the work. Done after the equipment row
    // exists so a rejected QR (already tagged) doesn't leave a stray item
    // behind; the RPC matches an existing catalogue row before creating one.
    const identity = blueStarIdentityFromForm(fieldDefs, values.custom_fields, qr)
    const { item: blueStarItem, error: itemError } = await upsertTaggedBlueStarItem({
      ...identity,
      cyrixCode: values.cyrix_item_code,
    })

    // The spare itself is saved by this point, so this can't be retried by
    // resubmitting -- the QR would come back as already tagged. Say plainly
    // what didn't happen and link to the spare instead of navigating away as
    // though everything worked: swallowing this is what let a Cyrix item the
    // tagger had picked disappear without a word.
    if (itemError || !blueStarItem) {
      setSavedId(data.id)
      setError(
        `The spare was saved, but it couldn't be added to the Blue Star item master${
          itemError ? `: ${itemError}` : ''
        }. Open it to link the Cyrix item.`
      )
      return
    }

    await supabase.from('equipment').update({ bluestar_item_id: blueStarItem.id }).eq('id', data.id)

    navigate('/scan', { replace: true, state: { toast: `Spare added at ${facility?.name ?? 'warehouse'}` } })
  }

  async function handleCreateFacility(input: { name: string; district: string | null; city: string | null }): Promise<FacilityRow> {
    if (!profile) throw new Error('Not signed in.')

    // Just the name: an admin fills in the district and city from
    // Admin -> Warehouses. Nothing is captured from the device.
    const { data, error: insertError } = await supabase
      .from('facilities')
      .insert({
        name: input.name,
        district: input.district,
        city: input.city,
        created_by: profile.id,
      })
      .select('*')
      .single()

    if (insertError || !data) throw new Error(insertError?.message ?? 'Could not add this warehouse.')

    await supabase.from('user_facilities').insert({ user_id: profile.id, facility_id: data.id })
    await refreshProfile()

    setFacilities((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
    return data
  }

  if (!qr) {
    return (
      <div className="mx-auto max-w-sm px-4 py-10 text-center">
        <AlertIcon className="mx-auto mb-3 h-8 w-8 text-amber-500" />
        <p className="mb-4 text-slate-600">Scan a QR code first to tag a new spare.</p>
        <Link to="/scan" className="font-medium text-brand-700 hover:underline">
          Go to scan
        </Link>
      </div>
    )
  }

  if (loading) return null

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6 sm:max-w-3xl sm:px-6 lg:max-w-4xl lg:py-8">
      <Link to="/scan" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ChevronLeftIcon className="h-4 w-4" /> Back
      </Link>
      <h1 className="mb-1 text-lg font-semibold text-slate-900 lg:text-xl">Tag new Blue Star spare</h1>
      <p className="mb-5 text-sm text-slate-500">
        Cyrix code: <span className="font-mono">{qr}</span>
      </p>

      {facilities.length === 0 && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          You aren't assigned to any warehouse yet — search below to add the one you're at now.
        </p>
      )}

      {/* Card framing only from `sm` up: on a phone the form already fills the
          screen, and a border round it would just be a line inside a line. */}
      <div className="sm:rounded-2xl sm:border sm:border-slate-200 sm:bg-surface sm:p-6 sm:shadow-sm lg:p-8">
        <EquipmentForm
          facilities={facilities}
          fieldDefs={fieldDefs}
          initialValues={{
            facility_id: facilities.length === 1 ? facilities[0].id : '',
            custom_fields: {},
            cyrix_item_code: undefined,
            cyrix_item_name: null,
          }}
          submitLabel="Save spare"
          submitting={submitting}
          suggestions={suggestions}
          onSubmit={handleSubmit}
          onCreateFacility={handleCreateFacility}
        />
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <p>{error}</p>
          {savedId && (
            <Link to={`/equipment/${savedId}`} className="mt-1 inline-block font-medium underline">
              Open the spare
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

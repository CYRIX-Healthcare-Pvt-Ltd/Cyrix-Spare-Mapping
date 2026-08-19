import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { EquipmentForm } from '../components/EquipmentForm'
import { ChevronLeftIcon, AlertIcon } from '../components/icons'
import type { FacilityRow, FieldDefinitionRow, EquipmentFormValues } from '../types/app'

export default function EquipmentNew() {
  const { profile } = useAuth()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const qr = searchParams.get('qr')

  const [facilities, setFacilities] = useState<FacilityRow[]>([])
  const [fieldDefs, setFieldDefs] = useState<FieldDefinitionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!profile) return
    const currentProfile = profile

    async function load() {
      const [{ data: allFacilities }, { data: fields }] = await Promise.all([
        supabase.from('facilities').select('*').eq('active', true).order('name'),
        supabase.from('field_definitions').select('*').eq('active', true).order('display_order'),
      ])
      const scoped =
        currentProfile.role === 'admin'
          ? (allFacilities ?? [])
          : (allFacilities ?? []).filter((f) => currentProfile.facilityIds.includes(f.id))
      setFacilities(scoped)
      setFieldDefs(fields ?? [])
      setLoading(false)
    }
    load()
  }, [profile])

  async function handleSubmit(values: EquipmentFormValues) {
    if (!qr || !profile) return
    setSubmitting(true)
    setError(null)

    const { data, error: insertError } = await supabase
      .from('equipment')
      .insert({
        qr_value: qr,
        facility_id: values.facility_id,
        name: values.name,
        location: values.location,
        images: values.images,
        custom_fields: values.custom_fields,
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

    navigate(`/equipment/${data.id}`, { replace: true })
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

  if (facilities.length === 0) {
    return (
      <div className="mx-auto max-w-sm px-4 py-10 text-center text-slate-600">
        You aren't assigned to any facility yet. Ask your admin to assign one before tagging equipment.
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <Link to="/scan" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ChevronLeftIcon className="h-4 w-4" /> Back
      </Link>
      <h1 className="mb-1 text-lg font-semibold text-slate-900">Tag new equipment</h1>
      <p className="mb-5 text-sm text-slate-500">
        Code: <span className="font-mono">{qr}</span>
      </p>

      <EquipmentForm
        facilities={facilities}
        fieldDefs={fieldDefs}
        initialValues={{
          facility_id: facilities.length === 1 ? facilities[0].id : '',
          name: '',
          location: '',
          images: [],
          custom_fields: {},
        }}
        submitLabel="Save equipment"
        submitting={submitting}
        onSubmit={handleSubmit}
      />
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  )
}

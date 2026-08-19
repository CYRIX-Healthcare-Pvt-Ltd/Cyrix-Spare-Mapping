import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { EquipmentForm } from '../components/EquipmentForm'
import { ChevronLeftIcon, PencilIcon, ClipboardIcon } from '../components/icons'
import { formatDate } from '../lib/formatDate'
import type { EquipmentRow, FacilityRow, FieldDefinitionRow, EquipmentFormValues } from '../types/app'

function toFormValues(eq: EquipmentRow): EquipmentFormValues {
  return {
    facility_id: eq.facility_id,
    custom_fields: eq.custom_fields,
  }
}

function buildDiff(original: EquipmentFormValues, updated: EquipmentFormValues) {
  const diff: Record<string, unknown> = {}
  if (updated.facility_id !== original.facility_id) diff.facility_id = updated.facility_id

  const customDiff: Record<string, unknown> = {}
  for (const key of Object.keys(updated.custom_fields)) {
    if (JSON.stringify(updated.custom_fields[key]) !== JSON.stringify(original.custom_fields[key])) {
      customDiff[key] = updated.custom_fields[key]
    }
  }
  if (Object.keys(customDiff).length > 0) diff.custom_fields = customDiff

  return diff
}

export default function EquipmentView() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()

  const [equipment, setEquipment] = useState<EquipmentRow | null>(null)
  const [facility, setFacility] = useState<FacilityRow | null>(null)
  const [taggedBy, setTaggedBy] = useState<{ full_name: string; ecode: string } | null>(null)
  const [allFacilities, setAllFacilities] = useState<FacilityRow[]>([])
  const [fieldDefs, setFieldDefs] = useState<FieldDefinitionRow[]>([])
  const [hasPendingRequest, setHasPendingRequest] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [editing, setEditing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!id || !profile) return
    setLoading(true)

    const { data: eq } = await supabase.from('equipment').select('*').eq('id', id).maybeSingle()
    if (!eq) {
      setNotFound(true)
      setLoading(false)
      return
    }
    setEquipment(eq)

    const [{ data: fac }, { data: facilities }, { data: fields }, { data: pending }, { data: tagger }] = await Promise.all([
      supabase.from('facilities').select('*').eq('id', eq.facility_id).maybeSingle(),
      supabase.from('facilities').select('*').eq('active', true).order('name'),
      supabase.from('field_definitions').select('*').eq('active', true).order('display_order'),
      supabase
        .from('edit_requests')
        .select('id')
        .eq('equipment_id', id)
        .eq('requested_by', profile.id)
        .eq('status', 'pending')
        .limit(1),
      eq.created_by
        ? supabase.from('profiles').select('full_name, ecode').eq('id', eq.created_by).maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    setFacility(fac ?? null)
    setTaggedBy(tagger ?? null)
    setAllFacilities(
      profile.role === 'admin' ? (facilities ?? []) : (facilities ?? []).filter((f) => profile.facilityIds.includes(f.id))
    )
    setFieldDefs(fields ?? [])
    setHasPendingRequest((pending ?? []).length > 0)
    setLoading(false)
  }, [id, profile])

  useEffect(() => {
    load()
  }, [load])

  async function handleDirectUpdate(values: EquipmentFormValues) {
    if (!equipment || !profile) return
    setSubmitting(true)
    setError(null)

    const { error: updateError } = await supabase
      .from('equipment')
      .update({
        facility_id: values.facility_id,
        custom_fields: values.custom_fields,
        updated_by: profile.id,
      })
      .eq('id', equipment.id)

    setSubmitting(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    setEditing(false)
    await load()
  }

  async function handleRequestEdit(values: EquipmentFormValues) {
    if (!equipment || !profile) return
    const diff = buildDiff(toFormValues(equipment), values)
    if (Object.keys(diff).length === 0) {
      setEditing(false)
      return
    }

    setSubmitting(true)
    setError(null)
    const { error: insertError } = await supabase.from('edit_requests').insert({
      equipment_id: equipment.id,
      requested_by: profile.id,
      proposed_changes: diff,
    })
    setSubmitting(false)

    if (insertError) {
      setError(insertError.message)
      return
    }
    setEditing(false)
    setHasPendingRequest(true)
  }

  if (loading) return null

  if (notFound || !equipment || !profile) {
    return (
      <div className="mx-auto max-w-sm px-4 py-10 text-center text-slate-600">
        <p className="mb-4">Equipment not found, or you don't have access to it.</p>
        <Link to="/scan" className="font-medium text-brand-700 hover:underline">
          Back to scan
        </Link>
      </div>
    )
  }

  const canEditDirectly = profile.role === 'project_manager' || profile.role === 'admin'

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <Link to="/" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ChevronLeftIcon className="h-4 w-4" /> Back
      </Link>

      {editing ? (
        <>
          <h1 className="mb-4 text-lg font-semibold text-slate-900">
            {canEditDirectly ? 'Edit equipment' : 'Request an edit'}
          </h1>
          <EquipmentForm
            facilities={allFacilities}
            fieldDefs={fieldDefs}
            initialValues={toFormValues(equipment)}
            submitLabel={canEditDirectly ? 'Save changes' : 'Submit request'}
            submitting={submitting}
            onSubmit={canEditDirectly ? handleDirectUpdate : handleRequestEdit}
          />
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="mt-3 w-full text-center text-sm text-slate-500 hover:text-slate-800"
          >
            Cancel
          </button>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </>
      ) : (
        <>
          <div className="mb-1 flex items-start justify-between gap-2">
            <h1 className="text-lg font-semibold text-slate-900">{equipment.name}</h1>
            {(canEditDirectly || !hasPendingRequest) && (
              <button
                onClick={() => setEditing(true)}
                className="flex shrink-0 items-center gap-1 rounded-lg border border-brand-200 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50"
              >
                <PencilIcon className="h-3.5 w-3.5" />
                {canEditDirectly ? 'Edit' : 'Request edit'}
              </button>
            )}
          </div>
          <p className="mb-4 text-sm text-slate-500">{facility?.name ?? 'Unknown facility'}</p>

          {hasPendingRequest && !canEditDirectly && (
            <p className="mb-4 flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              <ClipboardIcon className="h-3.5 w-3.5 shrink-0" />
              You have an edit request pending approval for this item.
            </p>
          )}

          {fieldDefs.length > 0 && (
            <dl className="mb-4 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
              {fieldDefs.map((f) => {
                const rawValue = equipment.custom_fields[f.field_key]
                if (f.field_type === 'image') {
                  const images = Array.isArray(rawValue) ? (rawValue as string[]) : []
                  return (
                    <div key={f.id} className="px-3 py-2 text-sm">
                      <dt className="mb-1.5 text-slate-500">{f.label}</dt>
                      {images.length === 0 ? (
                        <dd className="font-medium text-slate-800">—</dd>
                      ) : (
                        <dd className="flex flex-wrap gap-2">
                          {images.map((src, i) => (
                            <button
                              key={i}
                              onClick={() => setLightbox(src)}
                              className="h-14 w-14 overflow-hidden rounded-lg border border-slate-200"
                            >
                              <img src={src} alt={`${f.label} ${i + 1}`} className="h-full w-full object-cover" />
                            </button>
                          ))}
                        </dd>
                      )}
                    </div>
                  )
                }
                return (
                  <div key={f.id} className="flex justify-between gap-4 px-3 py-2 text-sm">
                    <dt className="text-slate-500">{f.label}</dt>
                    <dd className="text-right font-medium text-slate-800">{formatFieldValue(f, rawValue)}</dd>
                  </div>
                )
              })}
            </dl>
          )}

          <p className="text-xs text-slate-400">
            Tagged {formatDate(equipment.created_at)}
            {taggedBy && ` by ${taggedBy.full_name} (${taggedBy.ecode})`}
            {equipment.updated_at !== equipment.created_at && ` · updated ${formatDate(equipment.updated_at)}`}
          </p>
        </>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/90 p-4"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="Equipment full size" className="max-h-full max-w-full rounded-lg object-contain" />
        </div>
      )}
    </div>
  )
}

function formatFieldValue(field: FieldDefinitionRow, value: unknown) {
  if (value === undefined || value === null || value === '') return '—'
  if (field.field_type === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

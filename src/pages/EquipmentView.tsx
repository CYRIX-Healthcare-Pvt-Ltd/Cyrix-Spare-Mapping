import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { EquipmentForm } from '../components/EquipmentForm'
import { ChevronLeftIcon, PencilIcon, ClipboardIcon, HistoryIcon, AlertIcon } from '../components/icons'
import { formatDate } from '../lib/formatDate'
import { formatFieldValue } from '../lib/fieldFormat'
import { EquipmentHistoryDialog } from '../components/EquipmentHistoryDialog'
import { getCurrentPosition } from '../lib/geolocate'
import { haversineDistanceMeters, formatDistance, DISTANCE_WARNING_METERS } from '../lib/distance'
import type { EquipmentRow, FacilityRow, FieldDefinitionRow, EquipmentFormValues } from '../types/app'


interface Coords {
  lat: number
  lng: number
}

type PerformEdit = (values: EquipmentFormValues, position: Coords | null) => Promise<void>

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

// Same shape as buildDiff's output, but each changed value is wrapped as
// {from, to} instead of just the new value -- only equipment_history reads
// this enriched shape (for the "Ventilator → CT Scan" style log entries).
// edit_requests.proposed_changes must stay the flat buildDiff shape, since
// resolve_edit_request() merges it straight into equipment.custom_fields.
function buildHistoryChanges(original: EquipmentFormValues, updated: EquipmentFormValues) {
  const changes: Record<string, unknown> = {}
  if (updated.facility_id !== original.facility_id) {
    changes.facility_id = { from: original.facility_id, to: updated.facility_id }
  }

  const customChanges: Record<string, unknown> = {}
  for (const key of Object.keys(updated.custom_fields)) {
    if (JSON.stringify(updated.custom_fields[key]) !== JSON.stringify(original.custom_fields[key])) {
      customChanges[key] = { from: original.custom_fields[key] ?? null, to: updated.custom_fields[key] }
    }
  }
  if (Object.keys(customChanges).length > 0) changes.custom_fields = customChanges

  return changes
}

export default function EquipmentView() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [equipment, setEquipment] = useState<EquipmentRow | null>(null)
  const [facility, setFacility] = useState<FacilityRow | null>(null)
  const [taggedBy, setTaggedBy] = useState<{ full_name: string; ecode: string } | null>(null)
  const [updatedBy, setUpdatedBy] = useState<{ full_name: string; ecode: string } | null>(null)
  const [allFacilities, setAllFacilities] = useState<FacilityRow[]>([])
  const [fieldDefs, setFieldDefs] = useState<FieldDefinitionRow[]>([])
  const [hasPendingRequest, setHasPendingRequest] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [editing, setEditing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [distanceWarning, setDistanceWarning] = useState<string | null>(null)
  const [pendingEdit, setPendingEdit] = useState<{ values: EquipmentFormValues; position: Coords | null; perform: PerformEdit } | null>(
    null
  )

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

    const [{ data: fac }, { data: facilities }, { data: fields }, { data: pending }, { data: tagger }, { data: updater }] =
      await Promise.all([
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
        eq.updated_by
          ? supabase.from('profiles').select('full_name, ecode').eq('id', eq.updated_by).maybeSingle()
          : Promise.resolve({ data: null }),
      ])

    setFacility(fac ?? null)
    setTaggedBy(tagger ?? null)
    setUpdatedBy(updater ?? null)
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

  async function performDirectUpdate(values: EquipmentFormValues, position: Coords | null) {
    if (!equipment || !profile) return

    const historyChanges = buildHistoryChanges(toFormValues(equipment), values)

    const { error: updateError } = await supabase
      .from('equipment')
      .update({
        facility_id: values.facility_id,
        custom_fields: values.custom_fields,
        updated_by: profile.id,
      })
      .eq('id', equipment.id)

    if (!updateError && Object.keys(historyChanges).length > 0) {
      await supabase.from('equipment_history').insert({
        equipment_id: equipment.id,
        action: 'updated',
        changes: historyChanges,
        performed_by: profile.id,
        latitude: position?.lat ?? null,
        longitude: position?.lng ?? null,
      })
    }

    if (updateError) {
      setError(updateError.message)
      return
    }
    setEditing(false)
    await load()
  }

  async function performRequestEdit(values: EquipmentFormValues, position: Coords | null) {
    if (!equipment || !profile) return
    const diff = buildDiff(toFormValues(equipment), values)
    if (Object.keys(diff).length === 0) {
      setEditing(false)
      return
    }

    const { error: insertError } = await supabase.from('edit_requests').insert({
      equipment_id: equipment.id,
      requested_by: profile.id,
      proposed_changes: diff,
      latitude: position?.lat ?? null,
      longitude: position?.lng ?? null,
    })

    if (insertError) {
      setError(insertError.message)
      return
    }
    setEditing(false)
    setHasPendingRequest(true)
  }

  async function submitWithGpsCheck(values: EquipmentFormValues, perform: PerformEdit) {
    setSubmitting(true)
    setError(null)

    let position: Coords | null = null
    try {
      const pos = await getCurrentPosition()
      position = { lat: pos.coords.latitude, lng: pos.coords.longitude }
    } catch {
      // GPS is best-effort -- never blocks an edit on its own.
    }

    const targetFacility = allFacilities.find((f) => f.id === values.facility_id)
    if (position && targetFacility?.latitude != null && targetFacility?.longitude != null) {
      const distance = haversineDistanceMeters(position.lat, position.lng, targetFacility.latitude, targetFacility.longitude)
      if (distance > DISTANCE_WARNING_METERS) {
        setSubmitting(false)
        setPendingEdit({ values, position, perform })
        setDistanceWarning(formatDistance(distance))
        return
      }
    }

    await perform(values, position)
    setSubmitting(false)
  }

  async function confirmEditAnyway() {
    if (!pendingEdit) return
    setSubmitting(true)
    setDistanceWarning(null)
    await pendingEdit.perform(pendingEdit.values, pendingEdit.position)
    setSubmitting(false)
    setPendingEdit(null)
  }

  if (loading) return null

  if (notFound || !equipment || !profile) {
    return (
      <div className="mx-auto max-w-sm px-4 py-10 text-center text-slate-600">
        <p className="mb-4">Spare not found, or you don't have access to it.</p>
        <Link to="/scan" className="font-medium text-brand-700 hover:underline">
          Back to scan
        </Link>
      </div>
    )
  }

  const canEditDirectly = profile.role === 'project_manager' || profile.role === 'admin'

  // Seconds are shown only when two entries would otherwise look identical.
  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
      >
        <ChevronLeftIcon className="h-4 w-4" /> Back
      </button>

      {editing ? (
        <>
          <h1 className="mb-4 text-lg font-semibold text-slate-900">
            {canEditDirectly ? 'Edit spare' : 'Request an edit'}
          </h1>
          <EquipmentForm
            facilities={allFacilities}
            fieldDefs={fieldDefs}
            initialValues={toFormValues(equipment)}
            submitLabel={canEditDirectly ? 'Save changes' : 'Submit request'}
            submitting={submitting}
            disabled={!!distanceWarning}
            onSubmit={(values) => submitWithGpsCheck(values, canEditDirectly ? performDirectUpdate : performRequestEdit)}
          />

          {distanceWarning && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="flex items-start gap-1.5 text-sm text-amber-800">
                <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
                You're {distanceWarning} from this warehouse's recorded location. Continue anyway?
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={confirmEditAnyway}
                  disabled={submitting}
                  className="rounded-lg bg-brand-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                >
                  {submitting ? 'Saving…' : 'Continue anyway'}
                </button>
                <button
                  onClick={() => {
                    setDistanceWarning(null)
                    setPendingEdit(null)
                  }}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

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
          <p className="mb-4 text-sm text-slate-500">{facility?.name ?? 'Unknown warehouse'}</p>

          {hasPendingRequest && !canEditDirectly && (
            <p className="mb-4 flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              <ClipboardIcon className="h-3.5 w-3.5 shrink-0" />
              You have an edit request pending approval for this item.
            </p>
          )}

          {fieldDefs.length > 0 && (
            <div className="mb-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  {fieldDefs.map((f) => {
                    const rawValue = equipment.custom_fields[f.field_key]
                    if (f.field_type === 'image') {
                      const images = Array.isArray(rawValue) ? (rawValue as string[]) : []
                      return (
                        <tr key={f.id}>
                          <th scope="row" className="w-1/3 whitespace-nowrap px-3 py-2 text-left align-top font-normal text-slate-500">
                            {f.label}
                          </th>
                          <td className="px-3 py-2">
                            {images.length === 0 ? (
                              <span className="font-medium text-slate-800">—</span>
                            ) : (
                              <span className="flex flex-wrap gap-2">
                                {images.map((src, i) => (
                                  <button
                                    key={i}
                                    onClick={() => setLightbox(src)}
                                    className="h-14 w-14 overflow-hidden rounded-lg border border-slate-200"
                                  >
                                    <img src={src} alt={`${f.label} ${i + 1}`} className="h-full w-full object-cover" />
                                  </button>
                                ))}
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    }
                    return (
                      <tr key={f.id}>
                        <th scope="row" className="w-1/3 whitespace-nowrap px-3 py-2 text-left font-normal text-slate-500">
                          {f.label}
                        </th>
                        <td className="px-3 py-2 font-medium text-slate-800">{formatFieldValue(f, rawValue)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-start justify-between gap-2">
            <div className="space-y-0.5">
              <p className="text-xs text-slate-400">
                Tagged {formatDate(equipment.created_at)}
                {taggedBy && ` by ${taggedBy.full_name} (${taggedBy.ecode})`}
              </p>
              {equipment.updated_at !== equipment.created_at && (
                <p className="text-xs text-slate-400">
                  Updated {formatDate(equipment.updated_at)}
                  {updatedBy && ` by ${updatedBy.full_name} (${updatedBy.ecode})`}
                </p>
              )}
            </div>
            <button
              onClick={() => setHistoryOpen(true)}
              className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
            >
              <HistoryIcon className="h-3.5 w-3.5" /> History
            </button>
          </div>
        </>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="Spare full size" className="max-h-full max-w-full rounded-lg object-contain" />
        </div>
      )}

      {historyOpen && equipment && (
        <EquipmentHistoryDialog
          equipmentId={equipment.id}
          title={equipment.name}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </div>
  )
}

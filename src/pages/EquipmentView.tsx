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
import { blueStarIdentityFromForm, upsertTaggedBlueStarItem } from '../lib/blueStarItem'
import { setCyrixMapping } from '../lib/mapping'
import type {
  BlueStarItemRow,
  EquipmentRow,
  FacilityRow,
  FieldDefinitionRow,
  EquipmentFormValues,
} from '../types/app'


interface Coords {
  lat: number
  lng: number
}

type PerformEdit = (values: EquipmentFormValues, position: Coords | null) => Promise<void>

function toFormValues(eq: EquipmentRow, blueStar: BlueStarItemRow | null): EquipmentFormValues {
  return {
    facility_id: eq.facility_id,
    custom_fields: eq.custom_fields,
    // The Cyrix link lives on the spare's Blue Star catalogue row rather than
    // on the spare itself, so it is read back from there.
    cyrix_item_code: blueStar?.cyrix_item_code ?? null,
    cyrix_item_name: blueStar?.cyrix_item_name ?? null,
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
  const [blueStarItem, setBlueStarItem] = useState<BlueStarItemRow | null>(null)
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

    const [
      { data: fac },
      { data: facilities },
      { data: fields },
      { data: pending },
      { data: tagger },
      { data: updater },
      { data: blueStar },
    ] =
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
        eq.bluestar_item_id
          ? supabase.from('bluestar_item_master').select('*').eq('id', eq.bluestar_item_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ])

    setBlueStarItem(blueStar ?? null)
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

    const historyChanges = buildHistoryChanges(toFormValues(equipment, blueStarItem), values)

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

    // A manager's or admin's edit is final, so the spare's Blue Star catalogue
    // row is brought in line with it in the same breath -- including the Cyrix
    // link, which the RPC routes through the mapping history.
    const identity = blueStarIdentityFromForm(fieldDefs, values.custom_fields, equipment.qr_value)
    const { item: updatedItem } = await upsertTaggedBlueStarItem({
      ...identity,
      cyrixCode: values.cyrix_item_code,
    })
    if (updatedItem && updatedItem.id !== equipment.bluestar_item_id) {
      await supabase.from('equipment').update({ bluestar_item_id: updatedItem.id }).eq('id', equipment.id)
    }

    setEditing(false)
    await load()
  }

  async function performRequestEdit(values: EquipmentFormValues, position: Coords | null) {
    if (!equipment || !profile) return

    // The Cyrix link is deliberately outside the approval flow: re-mapping is
    // always allowed, and it is audited in its own history rather than gated.
    // Only the spare's own fields need a manager's approval, so the mapping is
    // applied now and the rest is proposed below.
    if (equipment.bluestar_item_id && values.cyrix_item_code !== (blueStarItem?.cyrix_item_code ?? null)) {
      const { error: mapError } = await setCyrixMapping(equipment.bluestar_item_id, values.cyrix_item_code)
      if (mapError) {
        setError(mapError)
        return
      }
    }

    const diff = buildDiff(toFormValues(equipment, blueStarItem), values)
    if (Object.keys(diff).length === 0) {
      setEditing(false)
      await load()
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
    <div className="mx-auto w-full max-w-md px-4 py-6 sm:max-w-3xl sm:px-6 lg:max-w-4xl lg:py-8">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
      >
        <ChevronLeftIcon className="h-4 w-4" /> Back
      </button>

      {editing ? (
        <>
          <h1 className="mb-4 text-lg font-semibold text-slate-900 lg:text-xl">
            {canEditDirectly ? 'Edit spare' : 'Request an edit'}
          </h1>
          <div className="sm:rounded-2xl sm:border sm:border-slate-200 sm:bg-white sm:p-6 sm:shadow-sm lg:p-8">
            <EquipmentForm
              facilities={allFacilities}
              fieldDefs={fieldDefs}
              initialValues={toFormValues(equipment, blueStarItem)}
              submitLabel={canEditDirectly ? 'Save changes' : 'Submit request'}
              submitting={submitting}
              disabled={!!distanceWarning}
              onSubmit={(values) => submitWithGpsCheck(values, canEditDirectly ? performDirectUpdate : performRequestEdit)}
            />
          </div>
          {!canEditDirectly && (
            <p className="mt-2 text-xs text-slate-500">
              Changes to the spare's fields go to your manager for approval. The Cyrix item link is applied straight
              away and recorded in the mapping history.
            </p>
          )}

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

          <div className="mb-4 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {/* The Cyrix QR stuck on the spare, and the Cyrix catalogue
                    item it has been linked to. Both sit above the tagger's own
                    fields because they are what identifies the item. */}
                <tr>
                  <th scope="row" className="w-1/3 whitespace-nowrap px-3 py-2 text-left font-normal text-slate-500">
                    Cyrix code
                  </th>
                  <td className="px-3 py-2 font-mono text-sm text-slate-700">{equipment.qr_value}</td>
                </tr>
                <tr>
                  <th scope="row" className="w-1/3 whitespace-nowrap px-3 py-2 text-left font-normal text-slate-500">
                    Cyrix item
                  </th>
                  <td className="px-3 py-2">
                    {blueStarItem?.cyrix_item_code ? (
                      <span className="font-medium text-slate-800">
                        <span className="font-mono text-sm text-slate-500">{blueStarItem.cyrix_item_code}</span>
                        {blueStarItem.cyrix_item_name && ` · ${blueStarItem.cyrix_item_name}`}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditing(true)}
                        className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-brand-50 hover:text-brand-700"
                      >
                        Not linked — link one
                      </button>
                    )}
                  </td>
                </tr>
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

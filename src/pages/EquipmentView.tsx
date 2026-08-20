import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { EquipmentForm } from '../components/EquipmentForm'
import { ChevronLeftIcon, PencilIcon, ClipboardIcon, HistoryIcon, XIcon, TagIcon, MapPinIcon } from '../components/icons'
import { formatDate } from '../lib/formatDate'
import { formatFieldValue } from '../lib/fieldFormat'
import { haversineDistanceMeters, formatDistance, DISTANCE_WARNING_METERS } from '../lib/distance'
import type { EquipmentRow, FacilityRow, FieldDefinitionRow, EquipmentFormValues, EquipmentHistoryRow } from '../types/app'

interface HistoryEntry extends EquipmentHistoryRow {
  performerName: string | null
  performerEcode: string | null
}

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

// Turns a history row's `changes` (same shape as an edit-request diff --
// facility_id and/or a custom_fields object) into plain "label: value" pairs
// for display, resolving custom field keys to their admin-defined labels.
function describeChanges(
  changes: Record<string, unknown>,
  fieldDefs: FieldDefinitionRow[],
  facilities: FacilityRow[]
): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = []
  if (typeof changes.facility_id === 'string') {
    const facilityName = facilities.find((f) => f.id === changes.facility_id)?.name ?? 'Unknown facility'
    out.push({ label: 'Facility', value: facilityName })
  }
  const customFields = changes.custom_fields
  if (customFields && typeof customFields === 'object') {
    for (const [key, value] of Object.entries(customFields as Record<string, unknown>)) {
      const field = fieldDefs.find((f) => f.field_key === key)
      if (field) {
        out.push({
          label: field.label,
          value: field.field_type === 'image' ? `${Array.isArray(value) ? value.length : 0} photo(s)` : formatFieldValue(field, value),
        })
      } else {
        out.push({ label: key, value: String(value) })
      }
    }
  }
  return out
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
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)

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

    const [{ data: fac }, { data: facilities }, { data: fields }, { data: pending }, { data: tagger }, { data: historyRows }] =
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
        supabase.from('equipment_history').select('*').eq('equipment_id', id).order('performed_at', { ascending: false }),
      ])

    setFacility(fac ?? null)
    setTaggedBy(tagger ?? null)
    setAllFacilities(
      profile.role === 'admin' ? (facilities ?? []) : (facilities ?? []).filter((f) => profile.facilityIds.includes(f.id))
    )
    setFieldDefs(fields ?? [])
    setHasPendingRequest((pending ?? []).length > 0)

    const performerIds = [...new Set((historyRows ?? []).map((h) => h.performed_by).filter((v): v is string => !!v))]
    const { data: performers } = performerIds.length
      ? await supabase.from('profiles').select('id, full_name, ecode').in('id', performerIds)
      : { data: [] }
    const performerMap = new Map((performers ?? []).map((p) => [p.id, p]))
    setHistory(
      (historyRows ?? []).map((h) => ({
        ...h,
        performerName: h.performed_by ? (performerMap.get(h.performed_by)?.full_name ?? null) : null,
        performerEcode: h.performed_by ? (performerMap.get(h.performed_by)?.ecode ?? null) : null,
      }))
    )

    setLoading(false)
  }, [id, profile])

  useEffect(() => {
    load()
  }, [load])

  async function handleDirectUpdate(values: EquipmentFormValues) {
    if (!equipment || !profile) return
    setSubmitting(true)
    setError(null)

    const diff = buildDiff(toFormValues(equipment), values)

    const { error: updateError } = await supabase
      .from('equipment')
      .update({
        facility_id: values.facility_id,
        custom_fields: values.custom_fields,
        updated_by: profile.id,
      })
      .eq('id', equipment.id)

    if (!updateError && Object.keys(diff).length > 0) {
      await supabase.from('equipment_history').insert({
        equipment_id: equipment.id,
        action: 'updated',
        changes: diff,
        performed_by: profile.id,
      })
    }

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

  const tagDistanceMeters =
    equipment.tag_latitude != null && equipment.tag_longitude != null && facility?.latitude != null && facility?.longitude != null
      ? haversineDistanceMeters(equipment.tag_latitude, equipment.tag_longitude, facility.latitude, facility.longitude)
      : null

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

          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-slate-400">
              Tagged {formatDate(equipment.created_at)}
              {taggedBy && ` by ${taggedBy.full_name} (${taggedBy.ecode})`}
              {equipment.updated_at !== equipment.created_at && ` · updated ${formatDate(equipment.updated_at)}`}
            </p>
            <button
              onClick={() => setHistoryOpen(true)}
              className="flex shrink-0 items-center gap-1 text-xs font-medium text-slate-500 hover:text-brand-700"
            >
              <HistoryIcon className="h-3.5 w-3.5" /> History
            </button>
          </div>
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

      {historyOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => setHistoryOpen(false)}>
          <div
            className="flex max-h-[85vh] w-full max-w-sm flex-col animate-pop-in rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-4">
              <h2 className="text-sm font-semibold text-slate-900">History</h2>
              <button
                onClick={() => setHistoryOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>
            <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto">
              {history.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-400">No history yet.</li>}
              {history.map((h) => {
                const details = describeChanges(h.changes, fieldDefs, allFacilities)
                return (
                  <li key={h.id} className="flex gap-3 px-4 py-3">
                    <span
                      className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full ${
                        h.action === 'created' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'
                      }`}
                    >
                      {h.action === 'created' ? <TagIcon className="h-3.5 w-3.5" /> : <PencilIcon className="h-3.5 w-3.5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800">
                        {h.action === 'created' ? 'Tagged' : 'Edited'} · {formatDate(h.performed_at)}
                      </p>
                      <p className="text-xs text-slate-500">
                        {h.performerName ? `${h.performerName}${h.performerEcode ? ` (${h.performerEcode})` : ''}` : 'Unknown user'}
                      </p>
                      {h.action === 'created' && tagDistanceMeters !== null && (
                        <span
                          className={`mt-1 inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                            tagDistanceMeters > DISTANCE_WARNING_METERS
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          <MapPinIcon className="h-3 w-3" />
                          {formatDistance(tagDistanceMeters)} from facility
                        </span>
                      )}
                      {details.length > 0 && (
                        <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
                          {details.map((d, i) => (
                            <li key={i}>
                              <span className="font-medium">{d.label}:</span> {d.value}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

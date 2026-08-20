import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { CheckIcon, XIcon, SpinnerIcon } from '../components/icons'
import { formatDate } from '../lib/formatDate'
import { describeChanges } from '../lib/describeChanges'
import type { EditRequestRow, EquipmentRow, FacilityRow, FieldDefinitionRow } from '../types/app'

interface DisplayRow extends EditRequestRow {
  equipment: EquipmentRow | null
  facilityName: string
  requesterName: string
  requesterEcode: string
}

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700',
  approved: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-red-50 text-red-700',
}

export default function EditRequests() {
  const { profile } = useAuth()
  const [rows, setRows] = useState<DisplayRow[]>([])
  const [fieldDefs, setFieldDefs] = useState<FieldDefinitionRow[]>([])
  const [facilities, setFacilities] = useState<FacilityRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectNote, setRejectNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const canReview = profile?.role === 'project_manager' || profile?.role === 'admin'

  const load = useCallback(async () => {
    if (!profile) return
    setLoading(true)

    const query = canReview
      ? supabase.from('edit_requests').select('*').order('created_at', { ascending: false }).limit(100)
      : supabase
          .from('edit_requests')
          .select('*')
          .eq('requested_by', profile.id)
          .order('created_at', { ascending: false })
          .limit(100)

    const [{ data: requests }, { data: fields }, { data: facilityRows }] = await Promise.all([
      query,
      supabase.from('field_definitions').select('*').eq('active', true).order('display_order'),
      supabase.from('facilities').select('*'),
    ])
    const list = requests ?? []
    setFieldDefs(fields ?? [])
    setFacilities(facilityRows ?? [])

    const equipmentIds = [...new Set(list.map((r) => r.equipment_id))]
    const requesterIds = [...new Set(list.map((r) => r.requested_by))]

    const [{ data: equipmentRows }, { data: profileRows }] = await Promise.all([
      equipmentIds.length ? supabase.from('equipment').select('*').in('id', equipmentIds) : Promise.resolve({ data: [] }),
      requesterIds.length
        ? supabase.from('profiles').select('id, full_name, ecode').in('id', requesterIds)
        : Promise.resolve({ data: [] }),
    ])

    const equipmentMap = new Map((equipmentRows ?? []).map((e) => [e.id, e]))
    const facilityMap = new Map((facilityRows ?? []).map((f) => [f.id, f.name]))
    const profileMap = new Map((profileRows ?? []).map((p) => [p.id, p]))

    setRows(
      list.map((r) => {
        const equipment = equipmentMap.get(r.equipment_id) ?? null
        return {
          ...r,
          equipment,
          facilityName: equipment ? (facilityMap.get(equipment.facility_id) ?? 'Unknown facility') : '',
          requesterName: profileMap.get(r.requested_by)?.full_name ?? 'Unknown',
          requesterEcode: profileMap.get(r.requested_by)?.ecode ?? '',
        }
      })
    )
    setLoading(false)
  }, [profile, canReview])

  useEffect(() => {
    load()
  }, [load])

  async function resolve(requestId: string, approve: boolean, note: string | null) {
    setBusyId(requestId)
    setError(null)
    const { error: rpcError } = await supabase.rpc('resolve_edit_request', {
      request_id: requestId,
      approve,
      note,
    })
    setBusyId(null)
    setRejectingId(null)
    setRejectNote('')
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    await load()
  }

  if (loading) return null

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <h1 className="mb-4 text-lg font-semibold text-slate-900">
        {canReview ? 'Edit requests' : 'Your edit requests'}
      </h1>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {rows.length === 0 && <p className="text-sm text-slate-500">Nothing here yet.</p>}

      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-1 flex items-start justify-between gap-2">
              <Link to={`/equipment/${r.equipment_id}`} className="font-medium text-slate-900 hover:underline">
                {r.equipment?.name ?? 'Deleted equipment'}
              </Link>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[r.status]}`}>
                {r.status}
              </span>
            </div>
            <p className="mb-2 text-xs text-slate-500">
              {r.facilityName} · requested by {r.requesterName}
              {r.requesterEcode && ` (${r.requesterEcode})`} ·{' '}
              {formatDate(r.created_at)}
            </p>
            <ProposedChanges
              changes={r.proposed_changes}
              fieldDefs={fieldDefs}
              facilities={facilities}
              current={r.equipment ?? undefined}
            />
            {r.review_note && <p className="mt-2 text-xs italic text-slate-500">Note: {r.review_note}</p>}

            {canReview && r.status === 'pending' && (
              <div className="mt-3">
                {rejectingId === r.id ? (
                  <div className="space-y-2">
                    <input
                      autoFocus
                      value={rejectNote}
                      onChange={(e) => setRejectNote(e.target.value)}
                      placeholder="Reason for rejecting (optional)"
                      className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => resolve(r.id, false, rejectNote || null)}
                        disabled={busyId === r.id}
                        className="flex-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                      >
                        Confirm reject
                      </button>
                      <button
                        onClick={() => setRejectingId(null)}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => resolve(r.id, true, null)}
                      disabled={busyId === r.id}
                      className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                    >
                      {busyId === r.id ? <SpinnerIcon className="h-3.5 w-3.5" /> : <CheckIcon className="h-3.5 w-3.5" />}
                      Approve
                    </button>
                    <button
                      onClick={() => setRejectingId(r.id)}
                      disabled={busyId === r.id}
                      className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                    >
                      <XIcon className="h-3.5 w-3.5" /> Reject
                    </button>
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ProposedChanges({
  changes,
  fieldDefs,
  facilities,
  current,
}: {
  changes: Record<string, unknown>
  fieldDefs: FieldDefinitionRow[]
  facilities: FacilityRow[]
  current?: EquipmentRow
}) {
  const details = describeChanges(changes, fieldDefs, facilities, current)
  if (details.length === 0) return null
  return (
    <ul className="space-y-0.5 text-xs text-slate-600">
      {details.map((d, i) => (
        <li key={i}>
          <span className="font-medium">{d.label}:</span> {d.value}
        </li>
      ))}
    </ul>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { CheckIcon, XIcon, SpinnerIcon, ClipboardIcon, HistoryIcon } from '../components/icons'
import { formatDate, pickTimeFormatter } from '../lib/formatDate'
import { describeChanges } from '../lib/describeChanges'
import { EquipmentHistoryDialog } from '../components/EquipmentHistoryDialog'
import type { EditRequestRow, EquipmentRow, EquipmentHistoryRow, FacilityRow, FieldDefinitionRow } from '../types/app'
import { SearchInput } from '../components/SearchInput'

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

/*
 * Two of the three kinds get a badge; `edit` does not.
 *
 * The colours are the ones those actions already wear elsewhere -- red for
 * retiring a spare, purple for the scanner and anything to do with codes --
 * so the badge is recognised before it is read.
 */
const KIND_STYLE: Record<string, string> = {
  delete: 'bg-red-50 text-red-700',
  remap: 'bg-purple-50 text-purple-700',
  mapping: 'bg-emerald-50 text-emerald-700',
  edit: '',
}

/** What the badge says. `edit` has none — see the comment at its use. */
const KIND_LABEL: Record<string, string> = {
  delete: 'delete',
  remap: 'new code',
  mapping: 'cyrix item',
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
  const [tab, setTab] = useState<'requests' | 'changes'>('requests')
  const [search, setSearch] = useState('')

  const canReview = profile?.role === 'project_manager' || (profile?.isSpareAdmin ?? false)

  /*
   * Purchase reviews one kind and only one kind.
   *
   * `canReview` still gates the queue itself — purchase sees it because
   * deciding what a spare is belongs to them. But the Approve and Reject
   * buttons appear per row, so a purchase account looking at a deletion
   * request sees it without being offered a verdict on it. The database
   * refuses either way; this is so nobody is offered a button that will
   * fail.
   */
  const canReviewKind = (kind: string) =>
    canReview || (profile?.role === 'purchase' && kind === 'mapping')
  const seesQueue = canReview || profile?.role === 'purchase'

  const pendingCount = rows.filter((r) => r.status === 'pending').length

  // Filtered in the browser: this list is already capped at 100 rows, so a
  // round trip per keystroke would cost more than it saves.
  const visibleRows = (() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) =>
      [r.equipment?.name, r.facilityName, r.requesterName, r.requesterEcode, r.status, JSON.stringify(r.proposed_changes)]
        .some((v) => v?.toLowerCase().includes(q))
    )
  })()

  const load = useCallback(async () => {
    if (!profile) return
    setLoading(true)

    const query = seesQueue
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
          // Blank when the spare names no warehouse. Since 0073 most do
          // not, and "Unknown facility" against every one of them reads
          // as a lookup that failed rather than a question nobody asked.
          facilityName: equipment?.facility_id
            ? (facilityMap.get(equipment.facility_id) ?? 'Unknown facility')
            : '',
          requesterName: profileMap.get(r.requested_by)?.full_name ?? 'Unknown',
          requesterEcode: profileMap.get(r.requested_by)?.ecode ?? '',
        }
      })
    )
    setLoading(false)
  }, [profile, seesQueue])

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
    <div className="mx-auto w-full max-w-md px-4 py-6 sm:max-w-4xl sm:px-6 lg:px-8 lg:py-8">
      <h1 className="mb-4 text-lg font-semibold text-slate-900 lg:text-xl">
        {seesQueue ? 'Requests' : 'Your requests'}
      </h1>

      {/* Tabs and search stack on a phone but share a row once there's width
          for them, so a wide screen doesn't push the list far down the page. */}
      <div className="mb-4 sm:flex sm:items-center sm:gap-3">
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1 sm:shrink-0">
          {(
            [
              { key: 'requests' as const, label: 'Requests', count: pendingCount },
              { key: 'changes' as const, label: 'Recent changes', count: null },
            ]
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors sm:flex-none sm:px-4 ${
                tab === t.key ? 'bg-surface text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.label}
              {t.count !== null && t.count > 0 && (
                <span className="ml-1.5 rounded-full bg-yellow-100 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-700">
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={tab === 'requests' ? 'Search spare, person, or status…' : 'Search spare, person, or field…'}
          className="mt-3 sm:mt-0 sm:flex-1"
        />
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {tab === 'changes' ? (
        <RecentChanges search={search} fieldDefs={fieldDefs} facilities={facilities} />
      ) : (
        <>
          {visibleRows.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-surface/60 px-6 py-12 text-center">
              <ClipboardIcon className="mx-auto mb-2 h-6 w-6 text-slate-300" />
              <p className="text-sm text-slate-500">{search ? 'Nothing matches that search.' : 'Nothing here yet.'}</p>
            </div>
          )}

          <ul className="space-y-3">
            {visibleRows.map((r) => (
          <li key={r.id} className="rounded-xl border border-slate-200 bg-surface p-4 shadow-sm">
            <div className="mb-1 flex items-start justify-between gap-2">
              <Link to={`/equipment/${r.equipment_id}`} className="font-medium text-slate-900 hover:underline">
                {r.equipment?.name ?? 'Deleted spare'}
              </Link>
              <div className="flex shrink-0 items-center gap-1.5">
                {/* Only when it is not an edit. Labelling the ordinary case
                    would put a badge on every row and make the two that
                    change the record itself no easier to pick out. */}
                {r.kind !== 'edit' && (
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${KIND_STYLE[r.kind]}`}>
                    {KIND_LABEL[r.kind] ?? r.kind}
                  </span>
                )}
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[r.status]}`}>
                  {r.status}
                </span>
              </div>
            </div>
            <p className="mb-2 text-xs text-slate-500">
              {r.facilityName} · requested by {r.requesterName}
              {r.requesterEcode && ` (${r.requesterEcode})`} ·{' '}
              {formatDate(r.created_at)}
            </p>
            {/*
              A field diff is one kind of answer to "what is being asked
              for". The other two are not diffs at all, so they say what
              they are in a sentence rather than being forced through a
              renderer built for changed fields.
            */}
            {r.kind === 'delete' ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                <p className="font-medium">Asks to delete this spare</p>
                <p className="mt-0.5 text-xs text-red-700">
                  {typeof r.proposed_changes.reason === 'string' && r.proposed_changes.reason
                    ? r.proposed_changes.reason
                    : 'No reason given.'}
                </p>
              </div>
            ) : r.kind === 'mapping' ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                <p className="font-medium">Asks to change the Cyrix item</p>
                <p className="mt-0.5 font-mono text-xs text-emerald-800">
                  {r.equipment?.cyrix_item_code ?? 'not set'}
                  {' → '}
                  {String(r.proposed_changes.cyrix_item_code ?? 'not set')}
                </p>
                {typeof r.proposed_changes.cyrix_item_name === 'string' && (
                  <p className="mt-0.5 text-xs text-emerald-800">
                    {r.proposed_changes.cyrix_item_name}
                  </p>
                )}
                {/* Says who can clear it, because this is the one kind
                    whose reviewers are not the usual ones. */}
                <p className="mt-1 text-xs text-emerald-700">
                  A manager or purchase can approve this.
                </p>
              </div>
            ) : r.kind === 'remap' ? (
              <div className="rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-sm text-purple-900">
                <p className="font-medium">Asks to replace the QR code</p>
                <p className="mt-0.5 font-mono text-xs text-purple-800">
                  {r.equipment?.qr_value ?? '—'} → {String(r.proposed_changes.qr_value ?? '—')}
                </p>
                <p className="mt-1 text-xs text-purple-700">
                  Same spare, same history. Only the code changes.
                </p>
              </div>
            ) : (
              <ProposedChanges
                changes={r.proposed_changes}
                fieldDefs={fieldDefs}
                facilities={facilities}
                current={r.equipment ?? undefined}
              />
            )}
            {r.review_note && <p className="mt-2 text-xs italic text-slate-500">Note: {r.review_note}</p>}

            {canReviewKind(r.kind) && r.status === 'pending' && (
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
                  <div className="flex gap-2 sm:justify-end">
                    <button
                      onClick={() => resolve(r.id, true, null)}
                      disabled={busyId === r.id}
                      className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60 sm:flex-none sm:px-5"
                    >
                      {busyId === r.id ? <SpinnerIcon className="h-3.5 w-3.5" /> : <CheckIcon className="h-3.5 w-3.5" />}
                      Approve
                    </button>
                    <button
                      onClick={() => setRejectingId(r.id)}
                      disabled={busyId === r.id}
                      className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60 sm:flex-none sm:px-5"
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
        </>
      )}
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

interface ChangeRow extends EquipmentHistoryRow {
  equipmentName: string
  facilityName: string
  performerName: string | null
  performerEcode: string | null
}

/**
 * What has actually been changed, as opposed to what's been requested --
 * every tag and edit across the spares this user can see, newest first.
 * Scoped by role the same way the tagged list is: an engineer sees their
 * own work, a manager sees their reports' too, an admin sees everything.
 */
function RecentChanges({
  search,
  fieldDefs,
  facilities,
}: {
  search: string
  fieldDefs: FieldDefinitionRow[]
  facilities: FacilityRow[]
}) {
  const { profile } = useAuth()
  const [rows, setRows] = useState<ChangeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [historyFor, setHistoryFor] = useState<ChangeRow | null>(null)

  useEffect(() => {
    if (!profile) return
    let cancelled = false

    async function load() {
      let creatorIds: string[] | null = [profile!.id]
      if (profile!.role === 'project_manager') {
        const { data: reports } = await supabase.from('profiles').select('id').eq('reports_to', profile!.id)
        creatorIds = [profile!.id, ...(reports ?? []).map((r) => r.id)]
      } else if (profile!.isSpareAdmin) {
        creatorIds = null
      }

      // History is keyed by equipment, so the visible spares are resolved
      // first and the log is then fetched for those.
      let eqQuery = supabase.from('equipment').select('id, name, facility_id')
      if (creatorIds) eqQuery = eqQuery.in('created_by', creatorIds)
      const { data: equipmentRows } = await eqQuery
      const equipment = equipmentRows ?? []
      if (cancelled) return

      if (equipment.length === 0) {
        setRows([])
        setLoading(false)
        return
      }

      const { data: historyRows } = await supabase
        .from('equipment_history')
        .select('*')
        .in(
          'equipment_id',
          equipment.map((e) => e.id)
        )
        .order('performed_at', { ascending: false })
        .limit(100)
      if (cancelled) return

      const list = historyRows ?? []
      const performerIds = [...new Set(list.map((h) => h.performed_by).filter((v): v is string => !!v))]
      const { data: performers } = performerIds.length
        ? await supabase.from('profiles').select('id, full_name, ecode').in('id', performerIds)
        : { data: [] }
      if (cancelled) return

      const eqById = new Map(equipment.map((e) => [e.id, e]))
      const facilityById = new Map(facilities.map((f) => [f.id, f.name]))
      const performerById = new Map((performers ?? []).map((p) => [p.id, p]))

      setRows(
        list.map((h) => {
          const eq = eqById.get(h.equipment_id)
          return {
            ...h,
            equipmentName: eq?.name ?? 'Deleted spare',
            facilityName: eq?.facility_id ? (facilityById.get(eq.facility_id) ?? '') : '',
            performerName: h.performed_by ? (performerById.get(h.performed_by)?.full_name ?? null) : null,
            performerEcode: h.performed_by ? (performerById.get(h.performed_by)?.ecode ?? null) : null,
          }
        })
      )
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [profile, facilities])

  const visible = (() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) =>
      [r.equipmentName, r.facilityName, r.performerName, r.performerEcode, JSON.stringify(r.changes)].some((v) =>
        v?.toLowerCase().includes(q)
      )
    )
  })()

  const formatTime = pickTimeFormatter(visible.map((r) => r.performed_at))

  if (loading) {
    return (
      <p className="flex items-center justify-center gap-1.5 py-6 text-sm text-slate-400">
        <SpinnerIcon className="h-4 w-4" /> Loading…
      </p>
    )
  }

  if (visible.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-surface/60 px-6 py-12 text-center">
        <HistoryIcon className="mx-auto mb-2 h-6 w-6 text-slate-300" />
        <p className="text-sm text-slate-500">{search ? 'Nothing matches that search.' : 'No changes yet.'}</p>
      </div>
    )
  }

  return (
    <>
      <ul className="space-y-3">
        {visible.map((r) => {
          const details = describeChanges(r.changes, fieldDefs, facilities)
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setHistoryFor(r)}
                className="w-full rounded-xl border border-slate-200 bg-surface p-4 text-left shadow-sm transition-colors hover:border-brand-300 hover:bg-brand-50/50"
              >
                <span className="mb-1 flex items-start justify-between gap-2">
                  <span className="font-medium text-slate-900">{r.equipmentName}</span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      r.action === 'created' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
                    }`}
                  >
                    {r.action === 'created' ? 'tagged' : 'edited'}
                  </span>
                </span>
                <span className="mb-2 block text-xs text-slate-500">
                  {r.facilityName && `${r.facilityName} · `}
                  {r.performerName ? `${r.performerName}${r.performerEcode ? ` (${r.performerEcode})` : ''}` : 'Unknown user'}
                  {' · '}
                  {formatTime(r.performed_at)}
                </span>
                {details.length > 0 && (
                  <span className="block space-y-0.5 text-xs text-slate-600">
                    {details.map((d, i) => (
                      <span key={i} className="block">
                        <span className="font-medium">{d.label}:</span> {d.value}
                      </span>
                    ))}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>

      {historyFor && (
        <EquipmentHistoryDialog
          equipmentId={historyFor.equipment_id}
          title={historyFor.equipmentName}
          onClose={() => setHistoryFor(null)}
        />
      )}
    </>
  )
}

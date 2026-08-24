import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { pickTimeFormatter } from '../lib/formatDate'
import { describeChanges } from '../lib/describeChanges'
import { SpinnerIcon, XIcon, TagIcon, PencilIcon } from './icons'
import type { EquipmentHistoryRow, FacilityRow, FieldDefinitionRow } from '../types/app'

interface HistoryEntry extends EquipmentHistoryRow {
  performerName: string | null
  performerEcode: string | null
  approverName: string | null
  approverEcode: string | null
}

function who(name: string | null, ecode: string | null): string {
  if (!name) return 'Unknown user'
  return ecode ? `${name} (${ecode})` : name
}

/**
 * The tag/edit timeline for one spare: who did what, when, and what each
 * field changed from and to.
 *
 * Self-contained -- it loads the history, the field definitions and the
 * warehouse list (so a changed warehouse renders as a name) itself from an
 * equipment id, so it can be opened from the spare's own page or straight
 * from the recent-changes feed without either caller having to assemble that
 * first.
 */
export function EquipmentHistoryDialog({
  equipmentId,
  title,
  onClose,
}: {
  equipmentId: string
  title?: string
  onClose: () => void
}) {
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [fieldDefs, setFieldDefs] = useState<FieldDefinitionRow[]>([])
  const [facilities, setFacilities] = useState<FacilityRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const [{ data: historyRows }, { data: fields }, { data: facilityRows }] = await Promise.all([
        supabase.from('equipment_history').select('*').eq('equipment_id', equipmentId).order('performed_at', { ascending: true }),
        supabase.from('field_definitions').select('*').eq('active', true).order('display_order'),
        supabase.from('facilities').select('*'),
      ])
      if (cancelled) return

      const list = historyRows ?? []
      // One lookup covering both the person who made each change and the
      // person who approved it.
      const peopleIds = [
        ...new Set(list.flatMap((h) => [h.performed_by, h.approved_by]).filter((v): v is string => !!v)),
      ]
      const { data: people } = peopleIds.length
        ? await supabase.from('profiles').select('id, full_name, ecode').in('id', peopleIds)
        : { data: [] }
      if (cancelled) return

      const byId = new Map((people ?? []).map((p) => [p.id, p]))
      setFacilities(facilityRows ?? [])
      setFieldDefs(fields ?? [])
      setEntries(
        list.map((h) => ({
          ...h,
          performerName: h.performed_by ? (byId.get(h.performed_by)?.full_name ?? null) : null,
          performerEcode: h.performed_by ? (byId.get(h.performed_by)?.ecode ?? null) : null,
          approverName: h.approved_by ? (byId.get(h.approved_by)?.full_name ?? null) : null,
          approverEcode: h.approved_by ? (byId.get(h.approved_by)?.ecode ?? null) : null,
        }))
      )
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [equipmentId])

  // Seconds are shown only when two entries would otherwise look identical.
  const formatTime = pickTimeFormatter(entries.map((e) => e.performed_at))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-sm flex-col animate-pop-in rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900">History</h2>
            {title && <p className="mt-0.5 truncate text-xs text-slate-500">{title}</p>}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <ul className="flex-1 overflow-y-auto p-4">
          {loading && (
            <li className="flex items-center justify-center gap-1.5 py-6 text-sm text-slate-400">
              <SpinnerIcon className="h-4 w-4" /> Loading…
            </li>
          )}
          {!loading && entries.length === 0 && (
            <li className="py-6 text-center text-sm text-slate-400">No history yet.</li>
          )}
          {entries.map((h, i) => {
            const details = describeChanges(h.changes, fieldDefs, facilities)
            return (
              <li key={h.id} className="flex gap-3">
                <div className="relative flex w-7 shrink-0 flex-col items-center">
                  <span
                    className={`z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full ${
                      h.action === 'created' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'
                    }`}
                  >
                    {h.action === 'created' ? <TagIcon className="h-3.5 w-3.5" /> : <PencilIcon className="h-3.5 w-3.5" />}
                  </span>
                  {i < entries.length - 1 && <span className="w-px flex-1 bg-slate-200" />}
                </div>
                <div className="min-w-0 flex-1 pb-5">
                  {/* Written as a sentence so the entry reads at a glance
                      rather than needing the labels decoded. */}
                  <p className="text-sm text-slate-900">
                    <span className="font-semibold">{h.action === 'created' ? 'Tagged' : 'Edited'}</span>
                    <span className="text-slate-500"> by </span>
                    <span className="font-medium">{who(h.performerName, h.performerEcode)}</span>
                  </p>
                  {h.approverName && (
                    <p className="text-sm text-slate-900">
                      <span className="font-semibold text-emerald-700">Approved</span>
                      <span className="text-slate-500"> by </span>
                      <span className="font-medium">{who(h.approverName, h.approverEcode)}</span>
                    </p>
                  )}
                  <p className="text-xs text-slate-500">{formatTime(h.performed_at)}</p>
                  {details.length > 0 && (
                    <ul className="mt-1.5 space-y-1 rounded-lg bg-slate-50 px-2.5 py-2 text-xs text-slate-600">
                      {details.map((d, i2) => (
                        <li key={i2}>
                          <span className="font-medium text-slate-700">{d.label}:</span> {d.value}
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
  )
}

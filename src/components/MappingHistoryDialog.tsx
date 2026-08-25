import { useEffect, useState } from 'react'
import { fetchMappingHistory, type MappingHistoryEntry } from '../lib/mapping'
import { pickTimeFormatter } from '../lib/formatDate'
import { SpinnerIcon, XIcon, PencilIcon, TagIcon } from './icons'
import type { BlueStarItemRow } from '../types/app'

/**
 * Every change to a Blue Star item's Cyrix mapping, oldest first: who
 * changed it, when, and what it was pointing at before. Since anyone can
 * re-map an item, this is what makes that safe to allow.
 */
export function MappingHistoryDialog({ item, onClose }: { item: BlueStarItemRow; onClose: () => void }) {
  const [entries, setEntries] = useState<MappingHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)

  // Seconds are shown only when two entries would otherwise look identical.
  const formatTime = pickTimeFormatter(entries.map((e) => e.performed_at))

  useEffect(() => {
    let cancelled = false
    fetchMappingHistory(item.id).then((rows) => {
      if (!cancelled) {
        setEntries(rows)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [item.id])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col animate-pop-in rounded-2xl bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900">Mapping history</h2>
            <p className="mt-0.5 truncate text-xs text-slate-500">
              <span className="font-mono">{item.item_code}</span> · {item.item_name}
              {item.barcode && <span className="text-slate-400"> · {item.barcode}</span>}
            </p>
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
            <li className="py-6 text-center text-sm text-slate-400">
              This item's Cyrix mapping hasn't been changed yet.
            </li>
          )}
          {entries.map((e, i) => {
            const isFirst = !e.from_cyrix_item_code
            const isCleared = !e.to_cyrix_item_code
            return (
              <li key={e.id} className="flex gap-3">
                <div className="relative flex w-7 shrink-0 flex-col items-center">
                  <span
                    className={`z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full ${
                      isCleared ? 'bg-amber-50 text-amber-600' : isFirst ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'
                    }`}
                  >
                    {isFirst ? <TagIcon className="h-3.5 w-3.5" /> : <PencilIcon className="h-3.5 w-3.5" />}
                  </span>
                  {i < entries.length - 1 && <span className="w-px flex-1 bg-slate-200" />}
                </div>
                <div className="min-w-0 flex-1 pb-5">
                  {/* Written as a sentence so the entry reads at a glance
                      rather than needing the labels decoded. */}
                  <p className="text-sm text-slate-900">
                    <span className="font-semibold">{isCleared ? 'Mapping cleared' : isFirst ? 'Mapped' : 'Re-mapped'}</span>
                    <span className="text-slate-500"> by </span>
                    <span className="font-medium">
                      {e.performerName
                        ? `${e.performerName}${e.performerEcode ? ` (${e.performerEcode})` : ''}`
                        : 'Unknown user'}
                    </span>
                  </p>
                  <p className="text-xs text-slate-500">{formatTime(e.performed_at)}</p>
                  <p className="mt-1.5 rounded-lg bg-slate-50 px-2.5 py-2 text-xs text-slate-600">
                    {e.from_cyrix_item_code && (
                      <>
                        <span className="font-mono text-slate-500">{e.from_cyrix_item_code}</span>
                        {e.from_cyrix_item_name && ` · ${e.from_cyrix_item_name}`}
                        {' → '}
                      </>
                    )}
                    {e.to_cyrix_item_code ? (
                      <>
                        <span className="font-mono text-slate-500">{e.to_cyrix_item_code}</span>
                        {e.to_cyrix_item_name && ` · ${e.to_cyrix_item_name}`}
                      </>
                    ) : (
                      <span className="italic text-slate-400">not mapped</span>
                    )}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

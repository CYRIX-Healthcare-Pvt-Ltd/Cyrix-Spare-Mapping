import { XIcon, AlertIcon } from './icons'
import type { MappingShare } from '../lib/blueStarItem'

/**
 * Every Cyrix item a part's units point at, with how many point at each.
 *
 * Behind a dialog rather than inline in the table: a part of twenty could in
 * principle have twenty different answers, and a cell that grows to twenty
 * lines makes the whole table unreadable to show something most rows don't
 * have. The cell says how many there are; this says which.
 */
export function MappingSplitDialog({
  itemCode,
  itemName,
  shares,
  onClose,
}: {
  itemCode: string
  itemName: string
  shares: MappingShare[]
  onClose: () => void
}) {
  const total = shares.reduce((sum, s) => sum + s.tagCount, 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col animate-pop-in rounded-2xl bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900">Cyrix items tagged against this part</h2>
            <p className="mt-0.5 truncate text-xs text-slate-500">
              <span className="tabular-nums">{itemCode}</span> · {itemName}
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

        {shares.length > 1 && (
          <p className="flex items-start gap-1.5 border-b border-slate-100 bg-amber-50 px-4 py-2.5 text-xs text-amber-700">
            <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Units of one part are mapped to different Cyrix items. One of these is likely wrong.
          </p>
        )}

        <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto">
          {shares.map((share) => (
            <li key={share.cyrixItemCode} className="flex items-start justify-between gap-3 px-4 py-3">
              <span className="min-w-0 text-sm text-slate-800">
                <span className="tabular-nums text-xs text-slate-500">{share.cyrixItemCode}</span>
                {share.cyrixItemName && ` · ${share.cyrixItemName}`}
              </span>
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                {share.tagCount} of {total}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

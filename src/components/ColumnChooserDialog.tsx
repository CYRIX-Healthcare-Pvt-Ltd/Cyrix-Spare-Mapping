import { useState } from 'react'
import { XIcon, SpinnerIcon, TrashIcon, ChevronUpIcon, ChevronDownIcon, AlertIcon } from './icons'
import { saveColumnLayout, deleteImportedColumn, isChoosable, isHideable, type CatalogueColumn } from '../lib/catalogueColumns'

/**
 * Which columns this catalogue shows, and in what order.
 *
 * A master file carries far more columns than fit on a screen, and which of
 * them matter is a question about how this warehouse works rather than one the
 * app can answer -- so the admin answers it, once, for everyone. That now
 * covers the app's own columns too: a warehouse with no use for Qty or the
 * tagging status can put them away.
 *
 * Two powers, not one. Every column but the item code can be hidden. Only the
 * file's own columns can be reordered or removed, because a built-in column
 * has a fixed place and a real database column behind it -- there is nothing
 * to remove it from. The item code is listed but never switched off: it is
 * how a row is recognised, ticked and deleted.
 */
export function ColumnChooserDialog({
  columns,
  onClose,
  onSaved,
}: {
  columns: CatalogueColumn[]
  onClose: () => void
  onSaved: () => void
}) {
  const pinned = columns.filter((c) => !isHideable(c))
  const [draft, setDraft] = useState<CatalogueColumn[]>(columns.filter(isHideable))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [removed, setRemoved] = useState<string[]>([])

  // Reordering only ever swaps two of the file's own columns, so it steps
  // past the built-in ones rather than pushing one out of its seeded place.
  function move(index: number, delta: number) {
    let target = index + delta
    while (target >= 0 && target < draft.length && !isChoosable(draft[target])) target += delta
    if (target < 0 || target >= draft.length) return
    setDraft((list) => {
      const next = [...list]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  /** Whether this column has anywhere to move in that direction. */
  function canMove(index: number, delta: number): boolean {
    let target = index + delta
    while (target >= 0 && target < draft.length && !isChoosable(draft[target])) target += delta
    return target >= 0 && target < draft.length
  }

  function toggle(key: string) {
    setDraft((list) => list.map((c) => (c.key === key ? { ...c, visible: !c.visible } : c)))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    const catalogue = columns[0]?.catalogue ?? 'bluestar'
    for (const key of removed) {
      const message = await deleteImportedColumn(catalogue, key)
      if (message) {
        setError(message)
        setSaving(false)
        return
      }
    }
    const message = await saveColumnLayout(draft)
    setSaving(false)
    if (message) {
      setError(message)
      return
    }
    onSaved()
    onClose()
  }

  const shownCount = draft.filter((c) => c.visible).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col animate-pop-in rounded-2xl bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Columns</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {draft.length === 0
                ? 'Columns appear here to be shown or hidden.'
                : `${shownCount} of ${draft.length} columns shown. Everyone sees the same table, so this sets it for the whole site.`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Stated, not offered. A row has to be recognisable to be worth
              listing, and the code is what recognises it. */}
          {pinned.length > 0 && (
            <div className="border-b border-slate-100 px-5 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Always shown</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {pinned.map((column) => (
                  <span
                    key={column.key}
                    className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
                  >
                    {column.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {draft.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-400">
              Nothing yet — upload a file and its own columns will be listed here.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {draft.map((column, index) => (
                <li key={column.key} className="flex items-center gap-2 px-4 py-2">
                  <input
                    type="checkbox"
                    id={`col-${column.key}`}
                    checked={column.visible}
                    onChange={() => toggle(column.key)}
                    className="h-4 w-4 shrink-0 accent-brand-700"
                  />
                  <label htmlFor={`col-${column.key}`} className="min-w-0 flex-1 truncate text-sm text-slate-900">
                    {column.label}
                    {/* Says why this row has no arrows or bin next to it,
                        rather than leaving a ragged column of empty space. */}
                    {!isChoosable(column) && (
                      <span className="ml-1.5 text-[11px] font-normal text-slate-400">built in</span>
                    )}
                  </label>

                  {isChoosable(column) && (
                    <span className="flex shrink-0 items-center">
                      <button
                        type="button"
                        onClick={() => move(index, -1)}
                        disabled={!canMove(index, -1)}
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                        aria-label={`Move ${column.label} up`}
                      >
                        <ChevronUpIcon className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(index, 1)}
                        disabled={!canMove(index, 1)}
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                        aria-label={`Move ${column.label} down`}
                      >
                        <ChevronDownIcon className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRemoved((r) => [...r, column.key])
                          setDraft((list) => list.filter((c) => c.key !== column.key))
                        }}
                        className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 hover:text-red-700"
                        aria-label={`Remove the ${column.label} column`}
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {removed.length > 0 && (
          <p className="border-t border-slate-100 px-5 pt-3 text-xs text-slate-500">
            {removed.length} column{removed.length === 1 ? '' : 's'} will stop being listed. The values stay in the
            database and come back if the next upload still has that column.
          </p>
        )}

        {error && (
          <p className="flex items-start gap-2 px-5 pt-3 text-sm text-red-600">
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-slate-100 p-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-on-brand disabled:opacity-60"
          >
            {saving && <SpinnerIcon className="h-4 w-4" />}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

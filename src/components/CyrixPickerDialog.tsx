import { useEffect, useState } from 'react'
import { findCyrixMatches, searchCyrixItems, type ScoredItem } from '../lib/itemMatch'
import { setCyrixMapping } from '../lib/mapping'
import { SearchIcon, SpinnerIcon, XIcon } from './icons'
import { MatchBadge, StockBadge } from './ItemBadges'
import type { BlueStarItemRow, CyrixItemRow } from '../types/app'

/**
 * Search-and-pick dialog for pointing a Blue Star item at a Cyrix item.
 * Opens pre-loaded with the closest name matches, and falls back to free
 * search over the whole catalogue. Used from the admin item-master list and
 * anywhere else a mapping needs changing after the fact.
 */
export function CyrixPickerDialog({
  item,
  onClose,
  onMapped,
}: {
  item: BlueStarItemRow
  onClose: () => void
  onMapped: (updated: BlueStarItemRow) => void
}) {
  const [suggestions, setSuggestions] = useState<ScoredItem[]>([])
  const [loading, setLoading] = useState(true)
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<CyrixItemRow[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    findCyrixMatches(item.item_name).then((s) => {
      if (!cancelled) {
        setSuggestions(s)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [item.item_name])

  useEffect(() => {
    if (!term.trim()) {
      setResults([])
      return
    }
    let cancelled = false
    const t = setTimeout(async () => {
      const found = await searchCyrixItems(term, 30)
      if (!cancelled) setResults(found)
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [term])

  async function choose(cyrixItem: CyrixItemRow) {
    setSaving(true)
    setError(null)
    const { item: updated, error: err } = await setCyrixMapping(item.id, cyrixItem.item_code)
    setSaving(false)
    if (err || !updated) {
      setError(err ?? 'Could not save the mapping.')
      return
    }
    onMapped(updated)
    onClose()
  }

  async function clearMapping() {
    setSaving(true)
    setError(null)
    const { item: updated, error: err } = await setCyrixMapping(item.id, null)
    setSaving(false)
    if (err || !updated) {
      setError(err ?? 'Could not clear the mapping.')
      return
    }
    onMapped(updated)
    onClose()
  }

  const shown = term.trim() ? results : suggestions.map((s) => s.item)
  const scoreOf = (id: string) => suggestions.find((s) => s.item.id === id)?.score

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col animate-pop-in rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900">Map to a Cyrix item</h2>
            <p className="mt-0.5 truncate text-xs text-slate-500">
              <span className="font-mono">{item.item_code}</span> · {item.item_name}
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

        <div className="border-b border-slate-100 p-3">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search the Cyrix item master…"
              className="w-full rounded-lg border border-slate-300 py-2 pl-8 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          {!term.trim() && (
            <p className="mt-2 text-xs text-slate-400">Closest matches by name — or search for something else.</p>
          )}
        </div>

        <ul className="flex-1 space-y-1 overflow-y-auto p-3">
          {loading && (
            <li className="flex items-center justify-center gap-1.5 py-6 text-sm text-slate-400">
              <SpinnerIcon className="h-4 w-4" /> Finding matches…
            </li>
          )}
          {!loading && shown.length === 0 && (
            <li className="py-6 text-center text-sm text-slate-400">
              {term.trim() ? 'Nothing matches that search.' : 'No close match — search for it above.'}
            </li>
          )}
          {shown.map((cyrixItem) => (
            <li key={cyrixItem.id}>
              <button
                type="button"
                disabled={saving}
                onClick={() => choose(cyrixItem)}
                className={`flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left text-sm hover:border-brand-300 hover:bg-brand-50 disabled:opacity-60 ${
                  cyrixItem.item_code === item.cyrix_item_code ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200'
                }`}
              >
                <span className="min-w-0 truncate">
                  <span className="font-mono text-xs text-slate-500">{cyrixItem.item_code}</span> · {cyrixItem.item_name}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <MatchBadge score={scoreOf(cyrixItem.id)} />
                  <StockBadge qty={cyrixItem.in_stock} />
                </span>
              </button>
            </li>
          ))}
        </ul>

        {error && <p className="px-4 pb-2 text-sm text-red-600">{error}</p>}

        <div className="flex items-center justify-between gap-2 border-t border-slate-100 p-4">
          {item.cyrix_item_code ? (
            <button
              type="button"
              onClick={clearMapping}
              disabled={saving}
              className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
            >
              Clear mapping
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
